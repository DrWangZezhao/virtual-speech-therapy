"""Praat F0 measurement with transparent quality and speaker-range normalization."""

from dataclasses import dataclass

import numpy as np
import parselmouth


@dataclass(frozen=True)
class PitchTrack:
    seconds: np.ndarray
    hz: np.ndarray
    corrected_frames: int = 0


@dataclass(frozen=True)
class SpeakerProfile:
    low_semitones: float
    high_semitones: float


def track_pitch(samples: np.ndarray, sample_rate: int) -> PitchTrack:
    raw = np.asarray(samples, dtype=np.float64)
    if raw.ndim != 1 or sample_rate <= 0 or not np.isfinite(raw).all():
        raise ValueError("Expected finite mono audio and a valid sample rate")
    if raw.size / sample_rate < 0.08:
        return PitchTrack(np.array([]), np.array([]))
    sound = parselmouth.Sound(raw, sampling_frequency=sample_rate)
    # Search bounds identify candidate periodicities only. Assessment uses a speaker profile.
    pitch = sound.to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=600,
                              very_accurate=True, voicing_threshold=0.5)
    hz = pitch.selected_array["frequency"].copy()
    hz[hz <= 0] = np.nan
    semitones = 12 * np.log2(hz)
    corrections = 0
    for i in range(1, len(semitones) - 1):
        before, current, after = semitones[i - 1:i + 2]
        if not np.isfinite([before, current, after]).all() or abs(before - after) > 2.0:
            continue
        difference = current - (before + after) / 2
        if abs(abs(difference) - 12) < 1.8:
            semitones[i] -= np.sign(difference) * 12
            corrections += 1
    smooth = semitones.copy()
    for i in range(1, len(semitones) - 1):
        window = semitones[i - 1:i + 2]
        if np.isfinite(window).all():
            smooth[i] = np.median(window)
    return PitchTrack(pitch.xs(), 2 ** (smooth / 12), corrections)


def fit_profile(*tracks: PitchTrack) -> SpeakerProfile | None:
    """Calibration material should include the same speaker producing varied pitches."""
    voiced = [track.hz[np.isfinite(track.hz)] for track in tracks]
    if not voiced or sum(values.size for values in voiced) < 30:
        return None
    low, high = np.quantile(12 * np.log2(np.concatenate(voiced)), (0.10, 0.90))
    return SpeakerProfile(float(low), float(high)) if high - low >= 2 else None


def measure_region(track: PitchTrack, start: float, end: float,
                   profile: SpeakerProfile | None, points: int = 21) -> dict:
    if not 0 <= start < end or points < 2:
        raise ValueError("Expected a positive time interval and at least two points")
    region = (track.seconds >= start) & (track.seconds <= end)
    values = track.hz[region]
    valid = np.isfinite(values)
    voiced_fraction = float(valid.mean()) if values.size else 0.0
    measured = [{"seconds": round(float(t), 4), "hz": round(float(hz), 2) if np.isfinite(hz) else None}
                for t, hz in zip(track.seconds[region], values, strict=True)]
    reason = None
    normalized = None
    if valid.sum() < 6 or voiced_fraction < 0.55:
        reason = "insufficient_voicing"
    elif profile is None:
        reason = "speaker_range_unavailable"
    else:
        relative_time = (track.seconds[region][valid] - start) / (end - start)
        pitches = (12 * np.log2(values[valid]) - profile.low_semitones) / (
            profile.high_semitones - profile.low_semitones)
        grid = np.linspace(0, 1, points)
        filled = np.interp(grid, relative_time, pitches, left=np.nan, right=np.nan)
        # Preserve unvoiced intervals. Grid values more than 16 ms from any voiced frame are unknown.
        nearest = np.min(np.abs(grid[:, None] - relative_time), axis=1)
        filled[nearest * (end - start) > 0.016] = np.nan
        normalized = [round(float(p), 4) if np.isfinite(p) else None for p in filled]
    return {"measured": measured, "normalized": normalized, "voiced_fraction": round(voiced_fraction, 4),
            "uncertainty": reason, "corrected_frames_in_recording": track.corrected_frames}


def contour_distance(attempt: list[float | None], reference: list[float | None]) -> dict:
    """A diagnostic distance. A validated scoring policy must interpret it."""
    pairs = [(a, b) for a, b in zip(attempt, reference, strict=True) if a is not None and b is not None]
    fraction = len(pairs) / len(attempt) if attempt else 0.0
    if fraction < 0.6:
        return {"distance": None, "overlap": fraction, "uncertainty": "insufficient_contour_overlap"}
    observed, expected = np.asarray(pairs).T
    return {"distance": float(np.sqrt(np.mean((observed - expected) ** 2))),
            "overlap": fraction, "uncertainty": "uncalibrated_distance"}

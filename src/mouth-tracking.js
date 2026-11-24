const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const TONGUE_CROP = {width:96,height:72,left:-.78,top:-.40,span:1.56};

export function readMouth(result, width, height) {
  const points = result.faceLandmarks?.[0];
  if (!points || !width || !height) return null;
  const point = index => ({
    x:points[index].x*width, y:points[index].y*height,
  });
  const first = point(61), last = point(291);
  const size = Math.hypot(last.x-first.x,last.y-first.y);
  if (!Number.isFinite(size) || size < 16) return null;
  const ux = (last.x-first.x)/size, uy = (last.y-first.y)/size;
  const center = {x:(first.x+last.x)/2,y:(first.y+last.y)/2};
  const project = p => ({
    x:((p.x-center.x)*ux+(p.y-center.y)*uy)/size,
    y:((p.y-center.y)*ux-(p.x-center.x)*uy)/size,
  });
  const upper = project(point(13)).y, lower = project(point(14)).y;
  const bottom = Math.max(lower+.035,project(point(17)).y);
  const opening = clamp(lower-upper,0,.8);
  const scores = Object.fromEntries((result.faceBlendshapes?.[0]?.categories ?? []).map(({categoryName,score})=>[categoryName,score]));
  const shape = name => scores[name] ?? 0;
  const round = Math.max(shape('mouthPucker'),shape('mouthFunnel')*.84);
  const spread = (shape('mouthSmileLeft')+shape('mouthSmileRight')+shape('mouthStretchLeft')+shape('mouthStretchRight'))/2;
  return {
    jaw:clamp(3*Math.max(shape('jawOpen')*.94,opening*1.4),0,2.95),
    lipAp:clamp((opening-.021)*4.25,0,2.45),
    lipProt:.20+round*1.38,
    lipWidth:clamp(.54+spread*.60-round*.76,.05,1),
    crop:{center,size,ux,uy,upper,lower,bottom,opening},
  };
}

export function tonguePixels(image, mouth) {
  const {width,height,left,top,span} = TONGUE_CROP;
  const {data} = image;
  const step = span/width;
  const mask = new Uint8Array(width*height);
  let skinRG = 0, skinBG = 0, skinCount = 0;
  for (let row=0; row<height; row++) {
    const y = top+row*step;
    if (y<mouth.bottom+.035 || y>mouth.bottom+.22) continue;
    for (let col=0; col<width; col++) {
      const x = Math.abs(left+col*step);
      if (x<.52 || x>.71) continue;
      const at = 4*(row*width+col);
      const [r,g,b] = [data[at],data[at+1],data[at+2]];
      if (r < 45) continue;
      skinRG += (r-g)/r;
      skinBG += (b-g)/r;
      skinCount++;
    }
  }
  if (!skinCount) return null;
  skinRG /= skinCount;
  skinBG /= skinCount;
  const outsideLip = (x,y) => y > mouth.bottom*Math.sqrt(1-Math.min(.98,(x/.51)**2))+.035;
  for (let row=0; row<height; row++) {
    const y = top+row*step;
    if (y<mouth.upper+.035 || y>mouth.bottom+.48) continue;
    for (let col=0; col<width; col++) {
      const x = left+col*step;
      if (Math.abs(x)>.48) continue;
      const index = row*width+col, at = index*4;
      const [r,g,b] = [data[at],data[at+1],data[at+2]];
      if (r>=62 && (r-g)/r>Math.max(.13,skinRG+.045) && (b-g)/r>Math.max(-.02,skinBG+.024)) mask[index]=1;
    }
  }

  // Components must cross the lower lip contour and visibly extend beyond it.
  const queue = new Int32Array(mask.length);
  let best, bestArea = 0;
  for (let start=0; start<mask.length; start++) {
    if (!mask[start]) continue;
    let head=0, tail=1, connected=0, area=0, tipWeight=0, tipX=0, maxY=0;
    queue[0]=start; mask[start]=0;
    while (head<tail) {
      const point=queue[head++], row=Math.floor(point/width), col=point%width;
      const x=left+col*step, y=top+row*step;
      if (y<mouth.lower-.015) connected++;
      if (outsideLip(x,y)) {
        const weight=1+Math.max(0,y-mouth.bottom)*12;
        tipX+=x*weight; tipWeight+=weight; area++; maxY=Math.max(maxY,y);
      }
      for (const next of [col>0 ? point-1 : -1,col<width-1 ? point+1 : -1,point-width,point+width]) {
        if (mask[next]) { mask[next]=0; queue[tail++]=next; }
      }
    }
    if (connected>=9 && area>=36 && maxY>mouth.bottom+.065 && area>bestArea) {
      bestArea=area;
      best={side:clamp(tipX/tipWeight/.39,-1,1),extension:clamp((maxY-mouth.bottom)/.3,.17,1)};
    }
  }
  return best ?? null;
}

export function findTongue(ctx, video, mouth) {
  if (!ctx || mouth.opening<.065 || Math.abs(mouth.uy)>.5) return null;
  const {width,height,left,top,span} = TONGUE_CROP;
  const {center,size,ux,uy} = mouth;
  const scale = width/(span*size);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,width,height);
  ctx.setTransform(scale*ux,-scale*uy,scale*uy,scale*ux,
    -scale*(ux*center.x+uy*center.y)-left*width/span,
    scale*(uy*center.x-ux*center.y)-top*width/span);
  ctx.drawImage(video,0,0);
  return tonguePixels(ctx.getImageData(0,0,width,height),mouth);
}

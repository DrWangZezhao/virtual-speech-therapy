import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const [url, audio, report] = process.argv.slice(2);
const browser=await chromium.launch({executablePath:process.env.VST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:[
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${resolve(audio)}`,
  '--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader'
]});
try{
  const context=await browser.newContext({viewport:{width:1280,height:880},permissions:['microphone']});
  const page=await context.newPage();
  page.on('pageerror',error=>console.error('PAGE',error.message));
  page.on('console',message=>{if(['warning','error'].includes(message.type()))console.log(message.type(),message.text().slice(0,600));});
  page.on('requestfailed',request=>console.log('NETWORK',new URL(request.url()).hostname,request.failure()?.errorText));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#avatar canvas').waitFor({timeout:25000});
  await page.waitForFunction(()=>document.querySelector('#item').options.length>=3);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.locator('#language').inputValue(),'en');
  for(const language of ['fi-FI','es-ES','zh-CN']){
    await page.locator('#language').selectOption(language);
    await page.locator('#levels button').last().click();
    assert.ok((await page.locator('#item option').count())>=3);
  }
  await page.locator('#interface').selectOption('zh-CN');
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  await page.locator('#tone-mode').click();
  assert.equal(await page.locator('#item-title').textContent(),'马');
  await Promise.all([page.waitForResponse(response=>response.url().includes('tone-ma-3.json')&&response.ok(),{timeout:12000}),page.locator('#play').click()]);
  await page.screenshot({path:report+'-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:report+'-mobile.png',fullPage:true});
  console.log('Avatar, four training languages, English default, independent Chinese UI, tone audio and mobile width verified');
  await page.evaluate(()=>{
    const getUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=constraints=>constraints.video ?
      Promise.reject(new DOMException('Test camera denial','NotAllowedError')) : getUserMedia(constraints);
  });
  await page.locator('#camera-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('摄像头不可用'));
  await page.locator('#record').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('正在录音'));
  await page.waitForTimeout(2800);
  await page.locator('#record').click();
  await page.locator('#recording').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#record').textContent.includes('重新练习'),null,{timeout:140000});
  console.log('RECORDING',await page.locator('#status').textContent(),await page.locator('#recognition').textContent());
  assert.ok((await page.locator('#recognition').textContent()).includes('·'), 'Real Whisper transcription expected');
  console.log('Camera denial, microphone pipeline, local Whisper inference, and attempt count verified');
}finally{await browser.close();}

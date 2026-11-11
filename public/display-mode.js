// Fullscreen is initiated by a tap; orientation locking is best-effort.
export function createDisplayMode({document:doc,screen,isMobile=()=>false,onChange=()=>{},onNotice=()=>{}}){
  let immersive=false,pending=false;
  const nativeElement=()=>doc.fullscreenElement||doc.webkitFullscreenElement;
  const mode=()=>nativeElement()?'fullscreen':immersive?'immersive':'normal';
  const publish=()=>onChange({mode:mode(),pending});
  function unlock(){try{screen?.orientation?.unlock?.();}catch{}}
  function sync(){if(!nativeElement()&&!immersive)unlock();publish();}
  const events=['fullscreenchange','webkitfullscreenchange'];
  for(const name of events)doc.addEventListener(name,sync);
  async function toggle(){
    if(pending)return;pending=true;publish();
    try{
      if(mode()!=='normal'){
        if(nativeElement()){
          const exit=doc.exitFullscreen||doc.webkitExitFullscreen;
          if(!exit)throw Error('无法退出全屏');
          await exit.call(doc);
        }
        immersive=false;unlock();return;
      }
      const root=doc.documentElement,request=root.requestFullscreen||root.webkitRequestFullscreen;
      try{
        if(!request)throw Error('Fullscreen unavailable');
        if(root.requestFullscreen)await request.call(root,{navigationUI:'hide'});
        else await request.call(root);
        if(!nativeElement())throw Error('Fullscreen not entered');
      }catch{
        immersive=true;
        onNotice('当前浏览器未开放全屏，已使用沉浸布局。横屏后操作更方便。');
        return;
      }
      if(isMobile()){
        try{if(!screen?.orientation?.lock)throw Error('Orientation unavailable');await screen.orientation.lock('landscape');}
        catch{onNotice('已进入全屏，请将手机横过来使用。');}
      }
    }catch{onNotice('暂时无法切换，请重试或使用浏览器的退出全屏按钮。');}
    finally{pending=false;publish();}
  }
  publish();
  return {toggle,mode,sync,destroy(){for(const name of events)doc.removeEventListener(name,sync);unlock();}};
}

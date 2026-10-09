/** Keep native dialog focus/escape semantics while animating its dismissal. */
export function closePopup(dialog:HTMLDialogElement|null,afterClose?:()=>void) {
  if(!dialog?.open){afterClose?.();return;}
  if(dialog.dataset.closing==='true')return;
  const finish=()=>{dialog.close();dialog.inert=false;delete dialog.dataset.closing;afterClose?.();};
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
  dialog.dataset.closing='true';dialog.inert=true;
  const animation=dialog.animate([
    {clipPath:'circle(150% at 50% 95%)',opacity:1,transform:'translateY(0)'},
    {clipPath:'circle(0% at 50% 95%)',opacity:0,transform:'translateY(12px)'},
  ],{duration:220,easing:'cubic-bezier(.55,.055,.675,.19)',fill:'forwards'});
  void animation.finished.catch(()=>{}).then(()=>{animation.cancel();finish();});
}

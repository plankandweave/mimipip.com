// A quiet original generative score. All sound begins from an explicit gesture.
export function createLandscapeSound() {
  const ctx = new AudioContext();
  const master = ctx.createGain(); master.gain.value = .16; master.connect(ctx.destination);
  const echo = ctx.createDelay(2); echo.delayTime.value = .71;
  const feedback = ctx.createGain(); feedback.gain.value = .23;
  echo.connect(feedback); feedback.connect(echo); echo.connect(master);
  let step = 0;
  const notes = [146.83,220,293.66,329.63,440,293.66,196,261.63];
  function chime() {
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    [1,2.002,3.997].forEach((ratio,i) => {
      const osc = ctx.createOscillator(), gain=ctx.createGain(), pan=ctx.createStereoPanner();
      osc.type='sine'; osc.frequency.value=notes[step%notes.length]*ratio;
      pan.pan.value=Math.sin(step*.8)*.45;
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.24/(i+1),t+.06);
      gain.gain.exponentialRampToValueAtTime(.0001,t+4.8-i*.5);
      osc.connect(gain);gain.connect(pan);pan.connect(master);pan.connect(echo);
      osc.start(t);osc.stop(t+5);
      osc.onended=()=>{osc.disconnect();gain.disconnect();pan.disconnect();};
    }); step++;
  }
  const noise=ctx.createBuffer(1,ctx.sampleRate*8,ctx.sampleRate), data=noise.getChannelData(0);
  let last=0;for(let i=0;i<data.length;i++){last=(last+.025*(Math.random()*2-1))/1.025;data[i]=last*.22;}
  const stream=ctx.createBufferSource();stream.buffer=noise;stream.loop=true;
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;
  stream.connect(filter);filter.connect(master);stream.start();
  const timer=window.setInterval(chime,3100);chime();
  return { resume:async()=>{await ctx.resume();chime();}, pause:()=>ctx.suspend(), close:()=>{clearInterval(timer);stream.stop();void ctx.close();}, state:()=>ctx.state };
}

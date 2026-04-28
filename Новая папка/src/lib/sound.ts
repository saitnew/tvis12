export class SoundEngine {
  ctx: AudioContext | null = null;
  bgmGain: GainNode | null = null;
  bgmInterval: any = null;
  trackIndex: number = 0;

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playKeystroke() {
    if (!this.ctx) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch(e) {}
  }

  playWordComplete() {
    if (!this.ctx) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.setValueAtTime(600, this.ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(800, this.ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch(e) {}
  }

  playDamage() {
    if (!this.ctx) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch(e) {}
  }

  playGameOver() {
    if (!this.ctx) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 1);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 1);
    } catch(e) {}
  }

  playMusic(trackIndex: number) {
    this.init();
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    this.trackIndex = trackIndex;
    
    if (!this.ctx) return;
    if (trackIndex === 0) return;

    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.ctx.destination);
    }
    this.bgmGain.gain.value = 0.05;

    let step = 0;
    
    const tracks = [
      null, 
      { type: 'square', notes: [220, 220, 330, 220, 261.63, 220, 330, 392], speed: 200 }, 
      { type: 'sine', notes: [440, 554.37, 659.25, 554.37, 880, 659.25, 554.37, 440], speed: 400 }, 
      { type: 'sawtooth', notes: [110, 110, 110, 110, 146.83, 146.83, 130.81, 130.81], speed: 300 }, 
      { type: 'triangle', notes: [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25], speed: 250 }, 
      { type: 'sine', notes: [261.63, 311.13, 392, 466.16], speed: 600 }, 
      { type: 'square', notes: [110, 220, 110, 330, 110, 220, 110, 440], speed: 150 } 
    ];

    const track = tracks[trackIndex];
    if (!track) return;

    this.bgmInterval = setInterval(() => {
      if (!this.ctx || !this.bgmGain) return;
      if (this.ctx.state !== 'running') return;
      
      const freq = track.notes[step % track.notes.length];
      const osc = this.ctx.createOscillator();
      osc.type = track.type as OscillatorType;
      osc.frequency.value = freq;
      
      const noteGain = this.ctx.createGain();
      noteGain.gain.setValueAtTime(1, this.ctx.currentTime);
      noteGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + (track.speed / 1000));
      
      osc.connect(noteGain);
      noteGain.connect(this.bgmGain);
      
      osc.start();
      osc.stop(this.ctx.currentTime + (track.speed / 1000));
      
      step++;
    }, track.speed);
  }
}

export const soundEngine = new SoundEngine();

import React, { useState, useRef, useEffect } from 'react';
import { ChordDiagram } from './ChordDiagram';
import { ScaleFretboard } from './ScaleFretboard';
import { useGuitarAudio } from './audioEngine';
import { chromaFromAnalyser } from './chordDetection';
import { NOTE_NAMES, pcSetFromFrets, identifyChord, parseFretInput } from './musicTheory';
import { CHORDS, HARMONY } from './chords';
import { PROGRESSIONS } from './progressions';
import { VOICINGS } from './voicings';
import { SCALE_DEFS, CHORD_SCALES } from './scales';
function Play({ size = 16, ...rest }) {
return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}><path d="M7 5l12 7-12 7z" /></svg>;
}
function Square({ size = 16, ...rest }) {
return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>;
}
function Mic({ size = 16, ...rest }) {
return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="17" x2="12" y2="21" /><line x1="8" y1="21" x2="16" y2="21" /></svg>;
}
function Logo({ size = 42 }) {
return (
<svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0" role="img" aria-label="Jazz Guitar Chords logo">
<rect x="2" y="2" width="60" height="60" rx="14" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
<circle cx="50" cy="11" r="2.6" fill="none" stroke="#22d3ee" strokeWidth="1.6" />
<rect x="13" y="16" width="38" height="3" rx="1.5" fill="#cbd5e1" />
{[14, 23, 32, 41, 50].map((x, i) => (
<line key={`s${i}`} x1={x} y1="18" x2={x} y2="52" stroke="#64748b" strokeWidth="1.4" />
))}
{[28, 38, 48].map((y, i) => (
<line key={`f${i}`} x1="14" y1={y} x2="50" y2={y} stroke="#475569" strokeWidth="1.4" />
))}
<circle cx="23" cy="23" r="4.3" fill="#FF6B35" stroke="#0f172a" strokeWidth="1" />
<circle cx="41" cy="33" r="4.3" fill="#FF6B35" stroke="#0f172a" strokeWidth="1" />
<circle cx="32" cy="43" r="4.3" fill="#FF6B35" stroke="#0f172a" strokeWidth="1" />
</svg>
);
}
const PRACTICE_STORAGE_KEY = 'jazz_practice_data';
const loadPracticeData = () => {
try {
const stored = localStorage.getItem(PRACTICE_STORAGE_KEY);
return stored ? JSON.parse(stored) : {};
} catch {
return {};
}
};
const savePracticeData = (data) => {
try {
localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(data));
} catch {
console.warn('localStorage save failed');
}
};
const today = () => new Date().toISOString().split('T')[0];
const logPractice = (data, chordName, proficiency) => {
if (!data[chordName]) {
data[chordName] = { sessions: [], totalPractices: 0, streak: 0, bestProficiency: 0, lastPracticeDate: null };
}
const chord = data[chordName];
const todayStr = today();
const existingToday = chord.sessions.find((s) => s.date === todayStr);
if (existingToday) {
existingToday.proficiency = proficiency;
} else {
chord.sessions.push({ date: todayStr, proficiency });
}
chord.totalPractices = chord.sessions.length;
chord.bestProficiency = Math.max(...chord.sessions.map((s) => s.proficiency), 0);
const sortedByDate = [...chord.sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
let streak = 0;
let checkDate = new Date(todayStr);
for (const session of sortedByDate) {
const sessionDate = new Date(session.date);
const diffMs = checkDate - sessionDate;
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
if (diffDays === 0) {
streak++;
checkDate = new Date(sessionDate);
checkDate.setDate(checkDate.getDate() - 1);
} else if (diffDays === 1) {
streak++;
checkDate = new Date(sessionDate);
checkDate.setDate(checkDate.getDate() - 1);
} else {
break;
}
}
chord.streak = streak;
chord.lastPracticeDate = todayStr;
return data;
};
const getLast30Days = (sessions) => {
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
const threshold = thirtyDaysAgo.toISOString().split('T')[0];
return sessions.filter((s) => s.date >= threshold).sort((a, b) => a.date.localeCompare(b.date));
};
const getProgressColor = (totalPractices, avgProficiency) => {
if (totalPractices >= 20) {
return 'bg-green-500';
} else if (totalPractices >= 5) {
return 'bg-yellow-500';
} else {
return 'bg-orange-500';
}
};
const getMilestones = (totalPractices) => {
const badges = [];
if (totalPractices >= 10) badges.push({ label: '🎸 10', color: 'bg-blue-600' });
if (totalPractices >= 50) badges.push({ label: '🔥 50', color: 'bg-red-600' });
if (totalPractices >= 100) badges.push({ label: '👑 100', color: 'bg-yellow-600' });
return badges;
};
const getEncouragement = (totalPractices, streak) => {
if (totalPractices === 10) return '🎸 You just hit 10 practices!';
if (totalPractices === 50) return '🔥 50 times! You\'re a machine!';
if (totalPractices === 100) return '👑 100 practices! Mastery unlocked!';
if (streak >= 7) return `🌟 ${streak}-day streak! Keep it rolling!`;
if (streak >= 3) return `⚡ ${streak}-day streak! You\'re on fire!`;
if (streak === 1) return '✨ Practice logged today!';
return null;
};
function PracticeChordCard({ chordName, frets, isOpen, isExpanded, onToggle, onLogPractice, practiceInfo, playChord }) {
const last30 = getLast30Days(practiceInfo.sessions);
const avgProficiency = last30.length ? Math.round((last30.reduce((s, x) => s + x.proficiency, 0) / last30.length) * 10) / 10 : 0;
const progressColor = getProgressColor(practiceInfo.totalPractices, avgProficiency);
const milestones = getMilestones(practiceInfo.totalPractices);
const encouragement = getEncouragement(practiceInfo.totalPractices, practiceInfo.streak);
const [selectedProficiency, setSelectedProficiency] = useState(3);
return (
<div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800">
<button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700 transition">
<div className="flex items-center gap-3 flex-1">
<div className="w-24">
<div className="font-bold text-cyan-300 text-sm">{chordName}</div>
<div className="text-xs text-slate-500">{practiceInfo.totalPractices} times</div>
</div>
<div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
<div className={`h-full ${progressColor} transition-all`} style={{ width: `${Math.min(practiceInfo.totalPractices / 25 * 100, 100)}%` }} />
</div>
{practiceInfo.streak > 0 && (
<div className="text-xs font-bold text-orange-400">🔥 {practiceInfo.streak}d</div>
)}
</div>
<div className="text-slate-500">
{isExpanded ? '▼' : '▶'}
</div>
</button>
{isExpanded && (
<div className="border-t border-slate-700 p-4 space-y-4 bg-slate-900">
<div className="flex justify-center">
<ChordDiagram frets={frets} size={1.2} />
</div>
<div className="grid grid-cols-3 gap-2 text-xs text-center">
<div className="bg-slate-800 rounded p-2">
<div className="text-slate-500">Total</div>
<div className="text-lg font-bold text-cyan-300">{practiceInfo.totalPractices}</div>
</div>
<div className="bg-slate-800 rounded p-2">
<div className="text-slate-500">Avg Score</div>
<div className="text-lg font-bold text-orange-400">{avgProficiency}/5</div>
</div>
<div className="bg-slate-800 rounded p-2">
<div className="text-slate-500">Streak</div>
<div className="text-lg font-bold text-yellow-400">{practiceInfo.streak}d</div>
</div>
</div>
{last30.length > 0 && (
<div className="bg-slate-800 rounded p-3 space-y-2">
<p className="text-xs text-slate-500 font-semibold">Last 30 days</p>
<div className="flex items-end gap-0.5 h-16">
{last30.map((session, i) => (
<div key={i} className="flex-1 bg-gradient-to-t from-cyan-500 to-cyan-300 rounded-t opacity-70 hover:opacity-100 transition" style={{ height: `${(session.proficiency / 5) * 100}%` }} title={`${session.date}: ${session.proficiency}/5`} />
))}
</div>
<p className="text-xs text-slate-500 text-center">{last30.length} sessions</p>
</div>
)}
<div className="space-y-2">
<p className="text-xs text-slate-400 font-semibold">Rate this practice:</p>
<div className="flex gap-1">
{[1, 2, 3, 4, 5].map((num) => (
<button key={num} onClick={() => setSelectedProficiency(num)} className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${selectedProficiency === num ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
{num}
</button>
))}
</div>
</div>
<div className="flex gap-2">
<button onClick={() => { onLogPractice(selectedProficiency); setSelectedProficiency(3); }} className="flex-1 bg-green-600 hover:bg-green-500 px-3 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition">
➕ Log
</button>
<button onClick={() => playChord(frets)} className="flex-1 bg-cyan-600 hover:bg-cyan-500 px-3 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition">
<Play size={14} /> Play
</button>
</div>
{encouragement && (
<div className="bg-slate-800 border border-orange-500/30 rounded p-2 text-center text-sm text-orange-300 font-semibold">
{encouragement}
</div>
)}
{milestones.length > 0 && (
<div className="flex flex-wrap gap-2">
{milestones.map((badge, i) => (
<span key={i} className={`${badge.color} text-white text-xs font-bold px-2 py-1 rounded-full`}>
{badge.label}
</span>
))}
</div>
)}
</div>
)}
</div>
);
}
const isOpen = (name) => CHORDS[name]?.type === 'open';
export default function App() {
const [tab, setTab] = useState('library');
const [selected, setSelected] = useState('Cmaj7');
const [bpm, setBpm] = useState(120);
const [built, setBuilt] = useState([]);
const [showBarre, setShowBarre] = useState(false);
const [fretInput, setFretInput] = useState('');
const [textResult, setTextResult] = useState(null);
const [listening, setListening] = useState(false);
const [micError, setMicError] = useState('');
const [liveNotes, setLiveNotes] = useState([]);
const [liveName, setLiveName] = useState('');
const micRef = useRef({ ctx: null, stream: null, raf: null, analyser: null });
const audio = useGuitarAudio();
const playChord = audio.playChord;
const [paSource, setPaSource] = useState(0);
const [paBpm, setPaBpm] = useState(100);
const [paBeats, setPaBeats] = useState(4);
const [paMetro, setPaMetro] = useState(true);
const [paPlaying, setPaPlaying] = useState(false);
const [paIndex, setPaIndex] = useState(0);
const schedRef = useRef({ timer: null });
const [voRoot, setVoRoot] = useState('C');
const [voQual, setVoQual] = useState('maj7');
const VO_QUALS = ['maj7', '7', 'm7', 'm7b5', '6', 'm6'];
const voName = voRoot + voQual;
const voList = (VOICINGS[voName] || []);
const [scRoot, setScRoot] = useState('C');
const [scQual, setScQual] = useState('maj7');
const [scIdx, setScIdx] = useState(0);
const scOptions = CHORD_SCALES[scQual] || [];
const scChoice = scOptions[Math.min(scIdx, scOptions.length - 1)] || scOptions[0];
const scIntervals = scChoice ? SCALE_DEFS[scChoice.s] : [];
const scRootPc = NOTE_NAMES.indexOf(scRoot);
const scNotes = scIntervals.map((iv) => NOTE_NAMES[(scRootPc + iv) % 12]).join(' ');
const paChords = paSource === 'builder' ? built : (PROGRESSIONS[paSource]?.chords || []);
const suggestions = built.length === 0 ? Object.keys(CHORDS).filter((c) => showBarre || isOpen(c)) : (HARMONY[built[built.length - 1]] || []).filter((c) => showBarre || isOpen(c));
const [practiceData, setPracticeData] = useState(loadPracticeData());
const [expandedChord, setExpandedChord] = useState(null);
const handleLogPractice = (chordName, proficiency) => {
const updatedData = { ...practiceData };
logPractice(updatedData, chordName, proficiency);
setPracticeData(updatedData);
savePracticeData(updatedData);
playChord(CHORDS[chordName].frets);
};
const stopPlayAlong = () => {
if (schedRef.current.timer) { clearInterval(schedRef.current.timer); schedRef.current.timer = null; }
setPaPlaying(false);
};
const startPlayAlong = () => {
const chords = paSource === 'builder' ? built : (PROGRESSIONS[paSource]?.chords || []);
if (!chords.length) return;
const ctx = audio.getCtx();
if (ctx.state === 'suspended') ctx.resume();
const r = schedRef.current;
r.chords = chords;
r.spb = 60 / paBpm;
r.bpc = paBeats;
r.metro = paMetro;
r.beat = 0;
r.chordIdx = 0;
r.nextTime = ctx.currentTime + 0.15;
setPaPlaying(true);
setPaIndex(0);
r.timer = setInterval(() => {
const c = audio.getCtx();
const lookahead = 0.13;
while (r.nextTime < c.currentTime + lookahead) {
const beatInChord = r.beat % r.bpc;
if (beatInChord === 0) {
const name = r.chords[r.chordIdx];
if (CHORDS[name]) audio.scheduleChord(CHORDS[name].frets, r.nextTime);
setPaIndex(r.chordIdx);
}
if (r.metro) audio.scheduleClick(r.nextTime, beatInChord === 0);
r.beat++;
if (r.beat % r.bpc === 0) r.chordIdx = (r.chordIdx + 1) % r.chords.length;
r.nextTime += r.spb;
}
}, 25);
};
const runTextIdentify = () => {
const frets = parseFretInput(fretInput);
if (!frets) { setTextResult({ error: 'Invalid format. Use xx0211, x x 0 2 1 1, or x,x,0,2,1,1' }); return; }
const { pcs, bass } = pcSetFromFrets(frets);
const names = identifyChord(pcs, bass);
const noteList = [...new Set(pcs)].map((p) => NOTE_NAMES[p]).join(', ');
setTextResult({ frets, names, noteList, error: null });
};
const startListening = () => {
navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } })
.then((stream) => {
const ctx = audio.getCtx();
if (ctx.state === 'suspended') ctx.resume();
const src = ctx.createMediaStreamSource(stream);
const analyser = ctx.createAnalyser();
analyser.fftSize = 2048;
src.connect(analyser);
const r = micRef.current;
r.ctx = ctx;
r.stream = stream;
r.analyser = analyser;
setListening(true);
setMicError('');
const loop = () => {
const pcs = chromaFromAnalyser(analyser, ctx.sampleRate);
setLiveNotes(pcs);
if (pcs.length >= 2) {
const names = identifyChord(pcs, pcs[0]);
setLiveName(names.length ? names[0].name : '');
} else {
setLiveName('');
}
r.raf = requestAnimationFrame(loop);
};
loop();
})
.catch(() => setMicError('Microphone access denied.'));
};
const stopListening = () => {
const r = micRef.current;
if (r.raf) cancelAnimationFrame(r.raf);
if (r.stream) r.stream.getTracks().forEach((t) => t.stop());
setListening(false);
setLiveNotes([]);
setLiveName('');
};
const playProgression = (chords) => {
const ctx = audio.getCtx();
if (ctx.state === 'suspended') ctx.resume();
const now = ctx.currentTime;
const spb = 0.8;
chords.forEach((name, i) => {
if (CHORDS[name]) audio.scheduleChord(CHORDS[name].frets, now + i * spb);
});
};
return (
<div className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden">
<header className="sticky top-0 z-50 bg-slate-800 border-b border-slate-700 px-4 py-3 shadow-lg">
<div className="flex items-center justify-between gap-3">
<div className="flex items-center gap-2">
<Logo size={32} />
<div>
<h1 className="text-lg font-bold text-cyan-400">Jazz Guitar v4</h1>
<p className="text-xs text-slate-400">Created by Jerh Collins</p>
</div>
</div>
{tab !== 'library' && (
<div className="flex items-center gap-2 text-xs">
<label className="flex items-center gap-1 cursor-pointer select-none">
<input type="checkbox" checked={showBarre} onChange={(e) => setShowBarre(e.target.checked)} className="w-4 h-4" />
<span className="text-slate-300">Barre</span>
</label>
</div>
)}
</div>
</header>
<div className="flex-1 overflow-y-auto">
<div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
{tab === 'library' && (
<div className="space-y-3">
<h2 className="text-2xl font-bold text-orange-400">Chord Library</h2>
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
{Object.keys(CHORDS).map((name) => (
<button key={name} onClick={() => { setSelected(name); playChord(CHORDS[name].frets); }} className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${selected === name ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
{name}
</button>
))}
</div>
{CHORDS[selected] && (
<div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
<div className="flex items-start justify-between">
<div>
<h3 className="text-2xl font-bold text-orange-400">{selected}</h3>
<p className="text-sm text-slate-400 mt-1">{CHORDS[selected].type === 'open' ? 'Open voicing' : 'Movable shape'}</p>
</div>
<button onClick={() => playChord(CHORDS[selected].frets)} className="bg-cyan-600 hover:bg-cyan-500 px-3 py-2 rounded-lg font-semibold inline-flex items-center gap-1.5">
<Play size={14} /> Play
</button>
</div>
<ChordDiagram frets={CHORDS[selected].frets} size={1.5} />
<p className="text-sm text-slate-300">Notes: <span className="font-semibold">{CHORDS[selected].notes}</span></p>
</div>
)}
</div>
)}
{tab === 'practice' && (
<div className="space-y-5">
<div>
<h2 className="text-2xl font-bold text-orange-400 mb-3">Practice Mode</h2>
<label className="block text-sm font-semibold text-slate-300 mb-2">Tempo (BPM): {bpm}</label>
<input type="range" min="40" max="240" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value))} className="w-full" />
</div>
<div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
<p className="text-sm text-slate-400 mb-4">Tap a chord to expand. Log your practice and rate your proficiency. Track your streak and watch your skills improve! 🎸</p>
<div className="space-y-2">
{Object.keys(CHORDS).filter((c) => showBarre || isOpen(c)).map((chordName) => {
const info = practiceData[chordName] || { sessions: [], totalPractices: 0, streak: 0, bestProficiency: 0, lastPracticeDate: null };
return (
<PracticeChordCard
key={chordName}
chordName={chordName}
frets={CHORDS[chordName].frets}
isOpen={isOpen(chordName)}
isExpanded={expandedChord === chordName}
onToggle={() => setExpandedChord(expandedChord === chordName ? null : chordName)}
onLogPractice={(prof) => handleLogPractice(chordName, prof)}
practiceInfo={info}
playChord={playChord}
/>
);
})}
</div>
</div>
</div>
)}
{tab === 'progressions' && (
<div className="space-y-5">
<h2 className="text-2xl font-bold text-orange-400">Pre-Built Progressions</h2>
{PROGRESSIONS.map((prog, i) => (
<div key={i} className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-orange-500/60 transition">
<div className="flex items-start justify-between gap-3 mb-2">
<div>
<h3 className="text-lg font-bold text-cyan-300">{prog.name}</h3>
<p className="text-xs text-slate-500 mt-1">{prog.analysis}</p>
</div>
<button onClick={() => playProgression(prog.chords)} className="bg-cyan-600 hover:bg-cyan-500 px-3 py-2 rounded-lg font-semibold whitespace-nowrap">
<Play size={14} />
</button>
</div>
<div className="flex flex-wrap items-center gap-2">
{prog.chords.map((c, j) => (
<React.Fragment key={j}>
<span className="bg-orange-500 text-white text-xs font-semibold px-2 py-1 rounded-md">{c}</span>
{j < prog.chords.length - 1 && <span className="text-slate-500">→</span>}
</React.Fragment>
))}
</div>
</div>
))}
</div>
)}
{tab === 'builder' && (
<div className="space-y-5">
<h2 className="text-2xl font-bold text-orange-400">Chord Builder</h2>
{built.length > 0 && (
<div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3">
<div className="flex items-center justify-between">
<p className="text-sm text-slate-400">Current progression:</p>
<button onClick={() => setBuilt([])} className="text-sm text-slate-400 hover:text-slate-200">Clear</button>
</div>
<div className="flex flex-wrap items-center gap-2">
{built.map((c, i) => (
<React.Fragment key={i}>
<span className="bg-orange-500 text-white text-sm font-semibold px-3 py-1 rounded-md">{c}</span>
{i < built.length - 1 && <span className="text-slate-500">→</span>}
</React.Fragment>
))}
</div>
<button onClick={() => playProgression(built)} className="bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
<Play size={14} /> Play
</button>
</div>
)}
<div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
<p className="text-slate-300 mb-3 font-medium">Choose chord #{built.length + 1}:</p>
{suggestions.length === 0 ? (
<p className="text-sm text-slate-500">No open-chord moves from here — turn on barre chords for more options, or clear and restart.</p>
) : (
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
{suggestions.map((c) => (
<button key={c} onClick={() => setBuilt([...built, c])} className="bg-slate-700 hover:bg-cyan-600 rounded-lg p-3 transition group">
<div className="font-bold text-cyan-300 group-hover:text-white mb-2 text-sm">{c}</div>
<ChordDiagram frets={CHORDS[c].frets} size={0.8} />
</button>
))}
</div>
)}
</div>
</div>
)}
{tab === 'voicings' && (
<div className="space-y-5">
<h2 className="text-2xl font-bold text-orange-400 mb-3">Jazz Voicings</h2>
<div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3">
<div className="flex flex-wrap gap-1.5">
{NOTE_NAMES.map((r) => (
<button key={r} onClick={() => setVoRoot(r)} className={`w-10 py-1.5 rounded-md text-sm font-semibold transition ${voRoot === r ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
{r}
</button>
))}
</div>
<div className="flex flex-wrap gap-1.5">
{VO_QUALS.map((q) => (
<button key={q} onClick={() => setVoQual(q)} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${voQual === q ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-cyan-300 hover:bg-slate-600'}`}>
{q}
</button>
))}
</div>
</div>
<h3 className="text-2xl font-bold text-orange-400">{voName}</h3>
{voList.length ? (
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
{voList.map((v, i) => (
<div key={i} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
<p className="text-xs font-semibold text-cyan-300 mb-1">{v.label}</p>
<ChordDiagram frets={v.frets} size={1} />
<p className="text-[10px] text-slate-500 mt-2 text-center">{v.notes}</p>
<button onClick={() => playChord(v.frets)} className="mt-2 w-full bg-cyan-600 hover:bg-cyan-500 py-1.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5">
<Play size={14} /> Play
</button>
</div>
))}
</div>
) : (
<p className="text-slate-500 text-sm">No voicings found.</p>
)}
</div>
)}
{tab === 'scales' && (
<div className="space-y-5">
<h2 className="text-2xl font-bold text-orange-400 mb-3">Scales & Improvisation</h2>
<div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3">
<div className="flex flex-wrap gap-1.5">
{NOTE_NAMES.map((r) => (
<button key={r} onClick={() => setScRoot(r)} className={`w-10 py-1.5 rounded-md text-sm font-semibold transition ${scRoot === r ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
{r}
</button>
))}
</div>
<div className="flex flex-wrap gap-1.5">
{VO_QUALS.map((q) => (
<button key={q} onClick={() => { setScQual(q); setScIdx(0); }} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${scQual === q ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-cyan-300 hover:bg-slate-600'}`}>
{q}
</button>
))}
</div>
</div>
{scOptions.length > 0 && (
<div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
<p className="text-sm text-slate-400 mb-3">Scales for <span className="text-orange-300 font-semibold">{scRoot}{scQual}</span>:</p>
<div className="flex flex-wrap gap-2">
{scOptions.map((o, i) => (
<button key={o.s} onClick={() => setScIdx(i)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${scIdx === i ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
{scRoot} {o.s}
</button>
))}
</div>
</div>
)}
{scChoice && (
<div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3">
<div className="flex items-baseline justify-between">
<h3 className="text-2xl font-bold text-orange-400">{scRoot} {scChoice.s}</h3>
<button onClick={() => audio.playScale(scRootPc, scIntervals)} className="bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
<Play size={14} /> Play
</button>
</div>
<p className="text-sm text-slate-400">{scChoice.why}</p>
<div className="overflow-x-auto pb-1">
<ScaleFretboard rootPc={scRootPc} intervals={scIntervals} />
</div>
<p className="text-sm text-slate-300">Notes: <span className="text-slate-100 font-semibold">{scNotes}</span></p>
</div>
)}
</div>
)}
{tab === 'identify' && (
<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
<div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
<h3 className="text-lg font-bold text-cyan-400">Type a shape</h3>
<div className="flex gap-2">
<input value={fretInput} onChange={(e) => setFretInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runTextIdentify(); }} placeholder="xx0211" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-600" />
<button onClick={runTextIdentify} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg font-semibold">Identify</button>
</div>
{textResult && (
<div className="mt-5">
{textResult.error ? (
<p className="text-sm text-amber-400">{textResult.error}</p>
) : (
<div className="flex gap-5 items-start">
<ChordDiagram frets={textResult.frets} size={1.1} />
<div className="flex-1 space-y-2">
{textResult.names.length ? (
<>
<p className="text-xs text-slate-500">Most likely</p>
<p className="text-2xl font-bold text-orange-400">{textResult.names[0].name}</p>
</>
) : (
<p className="text-slate-400">No chord matched.</p>
)}
<p className="text-xs text-slate-500">Notes: {textResult.noteList}</p>
</div>
</div>
)}
</div>
)}
</div>
<div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
<h3 className="text-lg font-bold text-cyan-400">Listen (Experimental)</h3>
{!listening ? (
<button onClick={startListening} className="bg-orange-500 hover:bg-orange-600 px-5 py-2.5 rounded-lg font-semibold inline-flex items-center gap-2">
<Mic size={18} /> Start listening
</button>
) : (
<>
<button onClick={stopListening} className="bg-red-600 hover:bg-red-700 px-5 py-2.5 rounded-lg font-semibold inline-flex items-center gap-2">
<Square size={18} /> Stop
</button>
{micError && <p className="text-sm text-red-400">{micError}</p>}
{liveName && <p className="text-xl font-bold text-cyan-300">{liveName}</p>}
</>
)}
</div>
</div>
)}
{tab === 'play-along' && (
<div className="space-y-5">
<h2 className="text-2xl font-bold text-orange-400">Play-Along</h2>
<div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
<div className="space-y-2">
<label className="block text-sm font-semibold">Progression:</label>
<select value={paSource} onChange={(e) => { setPaSource(e.target.value === 'builder' ? 'builder' : parseInt(e.target.value)); }} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100">
{PROGRESSIONS.map((p, i) => (
<option key={i} value={i}>{p.name}</option>
))}
<option value="builder">My progression</option>
</select>
</div>
<div className="space-y-2">
<label className="block text-sm font-semibold">Tempo: {paBpm} BPM</label>
<input type="range" min="60" max="180" value={paBpm} onChange={(e) => setPaBpm(parseInt(e.target.value))} className="w-full" />
</div>
<div className="space-y-2">
<label className="block text-sm font-semibold">Beats per chord: {paBeats}</label>
<input type="range" min="1" max="8" value={paBeats} onChange={(e) => setPaBeats(parseInt(e.target.value))} className="w-full" />
</div>
<label className="flex items-center gap-2 cursor-pointer select-none">
<input type="checkbox" checked={paMetro} onChange={(e) => setPaMetro(e.target.checked)} className="w-4 h-4" />
<span className="text-sm text-slate-300">Metronome</span>
</label>
<div className="flex gap-2">
{!paPlaying ? (
<button onClick={startPlayAlong} className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2.5 rounded-lg font-semibold inline-flex items-center gap-2">
<Play size={16} /> Start
</button>
) : (
<button onClick={stopPlayAlong} className="bg-red-600 hover:bg-red-700 px-4 py-2.5 rounded-lg font-semibold inline-flex items-center gap-2">
<Square size={16} /> Stop
</button>
)}
</div>
{paPlaying && paChords.length > 0 && (
<p className="text-lg font-bold text-orange-400">{paChords[paIndex]}</p>
)}
</div>
</div>
)}
</div>
</div>
<footer className="sticky bottom-0 z-50 bg-slate-800 border-t border-slate-700">
<div className="flex justify-around max-w-6xl mx-auto">
{[
{ id: 'library', label: 'Library' },
{ id: 'practice', label: 'Practice' },
{ id: 'progressions', label: 'Progressions' },
{ id: 'builder', label: 'Builder' },
{ id: 'voicings', label: 'Voicings' },
{ id: 'scales', label: 'Scales' },
{ id: 'identify', label: 'Identify' },
{ id: 'play-along', label: 'Play-Along' },
].map((t) => (
<button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 px-2 py-3 text-xs sm:text-sm font-semibold transition text-center ${tab === t.id ? 'bg-orange-500 text-white border-t-2 border-orange-400' : 'text-slate-400 hover:text-slate-200'}`}>
{t.label}
</button>
))}
</div>
</footer>
</div>
);
}

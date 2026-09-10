import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock3, Download, FileText, Play,
  Plus, Search, Settings, Trash2, Upload,
} from "lucide-react";
import { api, jsonBody } from "./api";
import { fmtSec, parseTc } from "./types";
import type { Contra, MeetingData, Question, Req, Segment } from "./types";
import "./tz.css";

type Tab = "reqs" | "clarify" | "questions" | "contradictions";
type Sel = { kind: "req" | "contra" | "q"; id: string };

export default function TzScreen() {
  const query = new URLSearchParams(useLocation().search);
  const meetingId = query.get("id");

  const [data, setData] = useState<MeetingData | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [tab, setTab] = useState<Tab>("reqs");
  const [sel, setSel] = useState<Sel | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({ title: "", description: "" });
  const [highlight, setHighlight] = useState<Segment | null>(null);
  const [askFor, setAskFor] = useState<Req | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [audio, setAudio] = useState({ cur: 0, dur: 0, playing: false });

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (meetingId && meetingId !== "mock") loadLive(meetingId);
    else {
      api("/api/mock")
        .then((d: MeetingData) => { setData(withResolved(d)); setLive(false); setSel(null); })
        .catch((e) => setError(String(e)));
    }
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const tick = () => setAudio((s) => ({ ...s, cur: a.currentTime }));
    const meta = () => setAudio((s) => ({ ...s, dur: a.duration || s.dur }));
    a.addEventListener("timeupdate", tick);
    a.addEventListener("loadedmetadata", meta);
    return () => {
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("loadedmetadata", meta);
    };
  }, [data?.meeting.id, live]);

  if (error) return <div className="app-ui"><div className="tz-body"><div className="state-card err">Ошибка: {error} — поднят ли бэк? (scripts/start_dev.py)</div></div></div>;
  if (!data) return <div className="app-ui"><div className="tz-body"><div className="crumb">Загрузка…</div></div></div>;

  const itemsAll = [...data.requirements, ...data.constraints];
  const contraIds = new Set(
    data.contradictions.flatMap((x) => x.requirement_public_ids.split(/[,;]/).map((s) => s.trim()))
  );
  const qOpen = data.open_questions.filter((q) => !q.resolved).length;
  const clarifyN = itemsAll.filter((r) => r.needs_clarification).length;

  const selReq = sel?.kind === "req" ? itemsAll.find((r) => r.id === sel.id) : undefined;
  const selContra = sel?.kind === "contra" ? data.contradictions.find((x) => x.id === sel.id) : undefined;
  const selQ = sel?.kind === "q" ? data.open_questions.find((q) => q.id === sel.id) : undefined;

  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const shownReqs = itemsAll
    .filter((r) => (tab === "clarify" ? r.needs_clarification : true))
    .filter((r) => !search || norm(`${r.public_id} ${r.title} ${r.description}`).includes(norm(search)))
    .sort((a, b) => (a.public_id < b.public_id ? -1 : 1));

  const linkedFrom = selReq?.source?.start_time ? parseTc(selReq.source.start_time) : null;
  const linkedTo = selReq?.source?.end_time ? parseTc(selReq.source.end_time) : null;
  const curSpeaker = data.transcript.find((s) => s.start_sec <= audio.cur && s.end_sec >= audio.cur)?.speaker;

  const seek = (t?: string, quote?: string) => {
    const sec = parseTc(t);
    if (sec != null && audioRef.current) {
      audioRef.current.currentTime = sec;
      if (audioRef.current.paused) audioRef.current.play().catch(() => {});
    }
    const seg = quote
      ? data.transcript.find((s) => s.text.includes(quote.slice(0, 25)))
      : data.transcript.find((s) => sec != null && s.start_sec <= sec && s.end_sec >= sec);
    if (seg) {
      setHighlight(seg);
      transcriptRef.current?.querySelector(`[data-seg="${seg.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a || !live) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };

  const seekWave = (e: ReactMouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !live || !audio.dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * audio.dur;
  };

  const patchLocal = (id: string, body: Partial<Req>) => {
    setData({
      ...data,
      requirements: data.requirements.map((r) => (r.id === id ? { ...r, ...body } : r)),
      constraints: data.constraints.map((r) => (r.id === id ? { ...r, ...body } : r)),
    });
  };

  const patch = async (req: Req, body: Partial<Req>) => {
    patchLocal(req.id, body);
    if (live) await api(`/api/requirements/${req.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  };

  const remove = async (req: Req) => {
    if (!window.confirm("Удалить это требование? Действие необратимо.")) return;
    setData({ ...data, requirements: data.requirements.filter((r) => r.id !== req.id) });
    setSel(null);
    if (live) await api(`/api/requirements/${req.id}`, { method: "DELETE" }).catch(() => {});
  };

  const toggleContra = async (x: Contra) => {
    setData({ ...data, contradictions: data.contradictions.map((c) => (c.id === x.id ? { ...c, resolved: !c.resolved } : c)) });
    if (live) await api(`/api/contradictions/${x.id}/resolve`, { method: "PATCH" }).catch(() => {});
  };

  const sendQuestion = async () => {
    if (!askFor || questionText.trim().length < 3) return;
    const q: Question = { id: `q${Date.now()}`, description: questionText.trim(), resolved: false };
    setData({ ...data, open_questions: [...data.open_questions, q] });
    patchLocal(askFor.id, { needs_clarification: true });
    if (live) await api(`/api/requirements/${askFor.id}/question`, jsonBody({ description: q.description })).catch(() => {});
    setAskFor(null);
    setQuestionText("");
    setTab("questions");
    setSel({ kind: "q", id: q.id });
  };

  const upload = async (file: File) => {
    try {
      setBusy("Загружаем файл на расшифровку…");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.[^.]+$/, ""));
      const m = await api("/api/meetings", { method: "POST", body: fd });
      return loadLive(m.id);
    } catch (e) {
      setBusy("");
      alert("Не удалось загрузить: " + e);
    }
  };

  async function loadLive(id: string) {
    try {
      const detail = await api(`/api/meetings/${id}`);
      const transcript = await api(`/api/meetings/${id}/transcript`);
      setData(withResolved({ ...detail, transcript }));
      setLive(true);
      setErrMsg("");
      if (["done", "error"].includes(detail.meeting.status)) {
        setBusy("");
        if (detail.meeting.status === "error") setErrMsg(detail.meeting.error || "ошибка обработки");
      } else {
        setBusy(stepLabel(detail.meeting.status));
        if (pollRef.current) window.clearTimeout(pollRef.current);
        pollRef.current = window.setTimeout(() => loadLive(id), 4000);
      }
      setSel((prev) => (prev && prev.kind !== "req" ? prev
        : detail.requirements?.[0] ? { kind: "req", id: detail.requirements[0].id } : null));
    } catch (e) {
      setError(String(e));
    }
  }

  function withResolved(d: MeetingData): MeetingData {
    d.contradictions = (d.contradictions || []).map((x) => ({ ...x, resolved: x.resolved ?? false }));
    return d;
  }

  function addManual() {
    if (!data) return;
    const title = window.prompt("Название нового требования");
    if (!title) return;
    const n = itemsAll.length + 1;
    setData({
      ...data,
      requirements: [...data.requirements, {
        id: `manual${Date.now()}`, public_id: `REQ-${String(n).padStart(3, "0")}`, type: "functional",
        title, description: "", priority: "medium", confidence: 1, needs_clarification: false,
        manual: true, for_roles: "ALL", user_stories: [],
      }],
    });
  }

  const exportTz = () => {
    if (live) window.open(`/api/meetings/${data.meeting.id}/export`);
    else alert("Экспорт подключится, когда загрузите реальную запись (сейчас моковые данные)");
  };

  const st = data.meeting.status;
  const dotClass = st === "done" ? "live-dot" : st === "error" ? "live-dot err" : "live-dot wait";

  return (
    <div className="app-ui">
      <header className="topbar">
        <div className="brand">require<span className="mark">x</span> <small>AI requirements</small></div>
        <nav>
          <Link to="/overview">Обзор</Link>
          <Link to="/home">Проекты</Link>
          <Link className="active" to={`/projects?id=${live ? data.meeting.id : "mock"}`}>Встречи</Link>
          <Link to="/projects?id=mock">ТЗ</Link>
        </nav>
        <div className="top-right">
          <span className={dotClass}>{st === "done" ? "готово" : st === "error" ? "ошибка" : "обработка"}</span>
          <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Загрузить запись"><Upload size={17} /></button>
          <button className="icon-btn" title="Настройки"><Settings size={17} /></button>
          <div className="avatar">RX</div>
        </div>
      </header>
      <input ref={fileRef} type="file" accept=".mp3,.wav,.m4a,.mp4" style={{ display: "none" }}
             onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

      <div className="tz-body">
        <div className="tz-head">
          <div className="grow">
            <div className="crumb">Проект / <b>{live ? data.meeting.title : "Демонстрация"}</b></div>
            <div className="tz-title">{data.meeting.title}</div>
            <div className="tz-sub">{data.meeting.description || "Техническое задание, сформированное AI из разговора команды"}</div>
          </div>
          <div className="stat-chips">
            <button className={`stat-chip ${tab === "reqs" ? "on" : ""}`} onClick={() => setTab("reqs")}><b>{itemsAll.length}</b> требований</button>
            <button className={`stat-chip problem ${tab === "questions" ? "on" : ""}`} onClick={() => setTab("questions")}><b>{qOpen}</b> вопросов</button>
            <button className={`stat-chip problem ${tab === "clarify" ? "on" : ""}`} onClick={() => setTab("clarify")}><b>{clarifyN}</b> требуют уточнения</button>
            {data.contradictions.length > 0 && (
              <button className={`stat-chip problem ${tab === "contradictions" ? "on" : ""}`} onClick={() => setTab("contradictions")}>
                <b>{data.contradictions.length}</b> противоречий
              </button>
            )}
          </div>
          <button className="btn btn-red" onClick={exportTz}><Download size={15} /> Скачать ТЗ</button>
        </div>

        <div className="audio">
          <audio ref={audioRef} src={live ? `/api/meetings/${data.meeting.id}/audio` : undefined}
                 onPlay={() => setAudio((s) => ({ ...s, playing: true }))}
                 onPause={() => setAudio((s) => ({ ...s, playing: false }))} />
          <button className="a-play" onClick={togglePlay} disabled={!live} aria-label="play">
            {audio.playing ? <span style={{ fontSize: 10, fontWeight: 800 }}>❚❚</span> : <Play size={13} color="#fff" />}
          </button>
          <div className="a-wave" onClick={seekWave}>
            {waveBars.map((h, i) => (
              <i key={i} className={audio.dur && (i / waveBars.length) * audio.dur <= audio.cur ? "p" : ""}
                 style={{ height: `${14 + h * 78}%` }} />
            ))}
          </div>
          <span className="a-time"><b>{fmtSec(audio.cur)}</b> / {fmtSec(audio.dur || data.meeting.duration_sec || 0)}</span>
          {live && !audio.dur && <span className="a-hint">аудио недоступно</span>}
          {curSpeaker && <span className="a-speaker">{curSpeaker}</span>}
        </div>

        {busy && (
          <div className="state-card wait">
            <b>{busy}</b>
            <div className="bar"><i /></div>
            <span>может занять пару минут — страницу можно не закрывать</span>
          </div>
        )}
        {!busy && errMsg && (
          <div className="state-card err"><AlertTriangle size={15} /> Ошибка обработки: {errMsg}. Загрузите запись заново (иконка ↑ справа сверху).</div>
        )}

        <div className="tabs">
          <button className={tab === "reqs" ? "active" : ""} onClick={() => setTab("reqs")}>Требования <span className="n">{itemsAll.length}</span></button>
          <button className={tab === "clarify" ? "active" : ""} onClick={() => setTab("clarify")}>Требуют уточнения <span className="n">{clarifyN}</span></button>
          <button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>Вопросы <span className="n">{data.open_questions.length}</span></button>
          <button className={tab === "contradictions" ? "active" : ""} onClick={() => setTab("contradictions")}>Противоречия <span className="n">{data.contradictions.length}</span></button>
        </div>

        <div className="grid-main">
          <aside className="panel p-list">
            <div className="panel-h">Элементы <button className="icon-btn" title="Добавить требование" onClick={addManual}><Plus size={15} /></button></div>
            <div className="search"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по требованиям…" /></div>
            <div className="panel-b">
              {(tab === "reqs" || tab === "clarify") && shownReqs.map((r) => (
                <div key={r.id} className={`item ${sel?.kind === "req" && sel.id === r.id ? "selected" : ""}`} title={r.title}
                     onClick={() => { setSel({ kind: "req", id: r.id }); setEditing(false); }}>
                  <div className="item-top">
                    <span className="item-code">{r.public_id} · {r.type === "constraint" ? "ОГРАНИЧЕНИЕ" : "ТРЕБОВАНИЕ"}</span>
                    <span className={`badge ${r.priority}`}>{r.priority}</span>
                  </div>
                  <div className="t">{r.title}</div>
                  <small>{r.source?.start_time ? `${r.source.start_time.slice(3)}–${(r.source.end_time ?? "").slice(3)} · ` : ""}{r.for_roles || "ALL"}</small>
                  {(contraIds.has(r.public_id) || r.needs_clarification) && (
                    <div className="flags">
                      {contraIds.has(r.public_id) && <span className="flag"><AlertTriangle size={10} /> противоречие</span>}
                      {r.needs_clarification && <span className="flag">уточнить</span>}
                    </div>
                  )}
                </div>
              ))}
              {tab === "questions" && data.open_questions.map((q) => (
                <div key={q.id} className={`item ${sel?.kind === "q" && sel.id === q.id ? "selected" : ""}`}
                     onClick={() => setSel({ kind: "q", id: q.id })}>
                  <div className="item-top"><span className="item-code">ВОПРОС</span>{q.resolved && <CheckCircle2 size={13} color="#2e7d32" />}</div>
                  <div className="t">{q.description}</div>
                </div>
              ))}
              {tab === "contradictions" && data.contradictions.map((x) => (
                <div key={x.id} className={`item conflict ${x.resolved ? "resolved" : ""} ${sel?.kind === "contra" && sel.id === x.id ? "selected" : ""}`}
                     onClick={() => setSel({ kind: "contra", id: x.id })}>
                  <div className="item-top"><span className="item-code">{x.requirement_public_ids}</span>{x.resolved && <CheckCircle2 size={13} color="#2e7d32" />}</div>
                  <div className="t">{x.description}</div>
                </div>
              ))}
              {tab === "reqs" && !shownReqs.length && <div className="empty">Ничего не найдено</div>}
            </div>
          </aside>

          <section className="panel p-detail">
            <div className="panel-b">
              {selReq ? (
                <ReqDetail r={selReq} inContra={contraIds.has(selReq.public_id)} patch={patch} remove={remove}
                           onAsk={() => setAskFor(selReq)}
                           editing={editing} setEditing={setEditing} editDraft={editDraft} setEditDraft={setEditDraft} />
              ) : selContra ? <ContraDetail x={selContra} onToggle={() => toggleContra(selContra)} />
              : selQ ? <QDetail q={selQ} />
              : <div className="empty">Выберите элемент слева</div>}
            </div>
          </section>

          <div className="panel p-trans">
            <div className="half">
              <div className="panel-h">Транскрипция <span className="count">{data.transcript.length} фраз</span></div>
              <div className="panel-b">
                <div ref={transcriptRef} className="tr">
                  {data.transcript.map((s) => {
                    const linked = linkedFrom != null && s.end_sec >= linkedFrom && s.start_sec <= (linkedTo ?? linkedFrom + 1);
                    return (
                      <p key={s.id} data-seg={s.id}
                         className={`tr-line ${linked ? "link" : ""} ${highlight?.id === s.id ? "now" : ""} ${live && s.start_sec <= audio.cur && s.end_sec >= audio.cur ? "now" : ""}`}
                         onClick={() => {
                           const a = audioRef.current;
                           if (a && live) { a.currentTime = s.start_sec; a.play().catch(() => {}); }
                           setHighlight(s);
                         }}>
                        <span className="tc">{fmtSec(s.start_sec)}</span>
                        <span><b>{s.speaker ?? "Говорящий"}:</b> {s.text}</span>
                      </p>
                    );
                  })}
                  {!data.transcript.length && <div className="empty" style={{ placeItems: "start" }}>Транскрипция появится после обработки.</div>}
                </div>
              </div>
            </div>
            <div className="half">
              <div className="panel-h">Источник требования <ArrowRight size={13} /></div>
              <div className="panel-b">
                {selReq?.source?.text ? (
                  <div className="source-card">
                    <div className="src-link">{selReq.public_id} ← исходная реплика</div>
                    <div className="source-time"><Clock3 size={13} /> {selReq.source.start_time?.slice(3) ?? "?"} — {selReq.source.end_time?.slice(3) ?? "?"}</div>
                    <blockquote>«{selReq.source.text}»</blockquote>
                    <button className="btn btn-dark btn-sm" onClick={() => seek(selReq.source?.start_time, selReq.source?.text)}>
                      <Play size={12} color="#fff" /> Открыть в записи
                    </button>
                  </div>
                ) : selReq ? (
                  <div className="note warn"><AlertTriangle size={15} /><span>Для этого требования источник в записи не найден — скорее всего, его добавили вручную или формулировку стоит уточнить.</span></div>
                ) : (
                  <div className="empty">Выберите требование — здесь появится его цитата из разговора</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {askFor && (
        <div className="tz-modal-back" onClick={() => setAskFor(null)}>
          <div className="tz-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Напишите ваш вопрос</h2>
            <span className="tag">{askFor.public_id} · {askFor.title}</span>
            <textarea autoFocus value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Мой вопрос…" />
            <div className="row">
              <button className="ghost" onClick={() => setAskFor(null)}>Отмена</button>
              <button className="primary" disabled={questionText.trim().length < 3} onClick={sendQuestion}>Отправить специалисту</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stepLabel(status: string) {
  return ({
    uploaded: "Файл принят — ждём расшифровку…",
    transcribing: "Расшифровываем аудиозапись…",
    analyzing: "AI анализирует требования…",
  } as Record<string, string>)[status] ?? "Обрабатываем запись…";
}

function ReqDetail({ r, inContra, patch, remove, onAsk, editing, setEditing, editDraft, setEditDraft }: {
  r: Req; inContra: boolean; patch: (r: Req, b: Partial<Req>) => void; remove: (r: Req) => void; onAsk: () => void;
  editing: boolean; setEditing: (v: boolean) => void;
  editDraft: { title: string; description: string }; setEditDraft: (v: { title: string; description: string }) => void;
}) {
  const conf = Math.round(r.confidence * 100);
  return (
    <div style={{ paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow">{r.public_id} · {r.type === "constraint" ? "ограничение" : "требование"}{r.manual ? " · вручную" : ""}</span>
        <button className="icon-btn danger" title="Удалить" onClick={() => remove(r)}><Trash2 size={15} /></button>
      </div>
      <div className="detail-title">{r.title}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className={`pill ${r.priority === "high" ? "red" : r.priority === "low" ? "green" : ""}`}>{r.priority.toUpperCase()} приоритет</span>
        <span className="pill">Роль: {r.for_roles || "ALL"}</span>
        <span className={`pill ${conf >= 85 ? "green" : "red"}`}>Confidence {conf}%</span>
      </div>

      <div className="sec">
        <h4>Формулировка</h4>
        <p>{r.description || "Описание не указано."}</p>
      </div>

      <div className="sec">
        <h4>AI-анализ</h4>
        <div className={`note ${inContra || r.needs_clarification ? "warn" : "good"}`}>
          {inContra || r.needs_clarification ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          <span>
            {inContra
              ? "Требование участвует в найденном противоречии — сверьте формулировки с участниками встречи."
              : r.needs_clarification
                ? "Цитата совпала с транскриптом не полностью — рекомендуем уточнить у автора речи."
                : "Требование подтверждено цитатой из записи: confidence = реальное совпадение с транскриптом, а не оценка модели."}
          </span>
        </div>
      </div>

      {!!r.user_stories?.length && (
        <div className="sec">
          <h4>User stories</h4>
          {r.user_stories.map((u) => (
            <div key={u.id} className="note plain" style={{ marginTop: 6 }}>Как <b style={{ margin: "0 4px" }}>{u.role}</b>, я хочу <b style={{ margin: "0 4px" }}>{u.action}</b>, чтобы <b style={{ margin: "0 4px" }}>{u.goal}</b>.</div>
          ))}
        </div>
      )}

      <div className="sec">
        <h4>Приоритет</h4>
        <div className="prio-row">
          {(["high", "medium", "low"] as const).map((p) => (
            <button key={p} className={r.priority === p ? "on" : ""} onClick={() => patch(r, { priority: p })}>
              {p === "high" ? "HIGH" : p === "medium" ? "MEDIUM" : "LOW"}
            </button>
          ))}
        </div>
      </div>

      <div className="sec">
        <h4>Редактирование</h4>
        {editing ? (
          <div className="edit-form">
            <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} placeholder="Название" />
            <textarea value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} placeholder="Описание" />
            <div className="detail-actions">
              <button className="btn btn-red" onClick={() => { patch(r, { title: editDraft.title, description: editDraft.description }); setEditing(false); }}>Сохранить</button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Отмена</button>
            </div>
          </div>
        ) : (
          <div className="detail-actions">
            <button className="btn btn-ghost" onClick={() => { setEditDraft({ title: r.title, description: r.description }); setEditing(true); }}><FileText size={14} /> Редактировать</button>
            <button className="btn btn-ghost" style={{ color: "var(--red)" }} onClick={onAsk}>
              {r.needs_clarification ? "Переоткрыть вопрос" : "Задать вопрос специалисту"}
            </button>
            <button className="btn btn-ghost" onClick={() => remove(r)}><Trash2 size={13} /> Удалить</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContraDetail({ x, onToggle }: { x: Contra; onToggle: () => void }) {
  return (
    <div style={{ paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow">Противоречие · {x.requirement_public_ids}</span>
        <AlertTriangle size={17} color="#e53935" />
      </div>
      <div className="detail-title" style={{ fontSize: 22 }}>{x.description}</div>
      <div className="sec">
        <h4>Рекомендация AI</h4>
        <div className="note good"><CheckCircle2 size={15} /><span>{x.recommendation || "Рекомендация не сгенерирована."}</span></div>
      </div>
      <div className="detail-actions">
        <button className={x.resolved ? "btn btn-ghost" : "btn btn-red"} onClick={onToggle}>
          {x.resolved ? "Снять отметку" : <><CheckCircle2 size={14} color="#fff" /> Отметить разрешённым</>}
        </button>
      </div>
    </div>
  );
}

function QDetail({ q }: { q: Question }) {
  return (
    <div style={{ paddingTop: 14 }}>
      <span className="eyebrow">Открытый вопрос {q.resolved && "· закрыт"}</span>
      <div className="detail-title" style={{ fontSize: 22 }}>{q.description}</div>
      {q.source_text && (
        <div className="sec">
          <h4>Контекст из разговора</h4>
          <div className="source-card"><blockquote>«{q.source_text}»</blockquote></div>
        </div>
      )}
      <div className="sec">
        <div className={`note ${q.resolved ? "good" : "plain"}`}>
          {q.resolved ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{q.resolved ? "Вопрос закрыт командой." : "Вопрос открыт — нужен ответ участников встречи."}</span>
        </div>
      </div>
    </div>
  );
}

const waveBars = Array.from({ length: 72 }, (_, i) =>
  0.25 + 0.75 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.31) + 0.4 * Math.sin(i * 1.7)));

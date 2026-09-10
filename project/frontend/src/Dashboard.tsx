import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileAudio, Plus, Settings, Upload, Video, X } from "lucide-react";
import { api } from "./api";
import "./tz.css";

type MeetingItem = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  requirements_count: number;
};

const STATUS_RU: Record<string, string> = {
  uploaded: "в очереди", transcribing: "расшифровка", analyzing: "анализ", done: "готово", error: "ошибка",
};
const STATUS_CLASS: Record<string, string> = {
  done: "done", error: "err", uploaded: "idle", transcribing: "work", analyzing: "work",
};

export default function Dashboard() {
  const [list, setList] = useState<MeetingItem[] | null>(null);
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api("/api/meetings").then((l: MeetingItem[]) => setList(l)).catch(() => setList([]));
  }, []);

  const upload = async (file: File) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.[^.]+$/, ""));
      const m = await api("/api/meetings", { method: "POST", body: fd });
      nav(`/projects?id=${m.id}`);
    } catch (e) {
      alert("Не удалось загрузить: " + e);
    }
  };

  const del = async (m: MeetingItem) => {
    if (!window.confirm(`Удалить встречу «${m.title}» вместе со всеми требованиями? Это необратимо.`)) return;
    try {
      await api(`/api/meetings/${m.id}`, { method: "DELETE" });
      setList((l) => (l ?? []).filter((x) => x.id !== m.id));
    } catch (e) {
      alert("Не удалось удалить: " + e);
    }
  };

  return (
    <div className="app-ui">
      <header className="topbar">
        <div className="brand">require<span className="mark">x</span> <small>AI requirements</small></div>
        <nav>
          <Link to="/overview">Обзор</Link>
          <Link className="active" to="/home">Проекты</Link>
          <Link to="/projects?id=mock">Встречи</Link>
          <Link to="/projects?id=mock">ТЗ</Link>
        </nav>
        <div className="top-right">
          <button className="icon-btn" title="Настройки"><Settings size={17} /></button>
          <div className="avatar">RX</div>
        </div>
      </header>
      <input ref={fileRef} type="file" accept=".mp3,.wav,.m4a,.mp4" style={{ display: "none" }}
             onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

      <div className="dash">
        <div className="dash-in">
          <section className="hero">
            <div>
              <div className="eyebrow" style={{ color: "var(--red)" }}>AI requirements workspace</div>
              <h1>Превратите разговор<br />в <span>готовое ТЗ</span></h1>
              <p>Загрузите запись встречи — система выделит требования, роли, противоречия и вопросы, а затем свяжет каждое требование с исходной репликой.</p>
            </div>
            <div className="hero-side">
              <button className="btn btn-red" style={{ height: 46, fontSize: 15 }} onClick={() => fileRef.current?.click()}>
                <Plus size={17} color="#fff" /> Новая встреча
              </button>
              <Link className="btn btn-ghost" style={{ height: 46, fontSize: 15 }} to="/projects?id=mock">
                Открыть демо-ТЗ <ArrowRight size={15} />
              </Link>
            </div>
          </section>

          <section className="steps">
            <div className="step"><div className="num">01</div><h3>Загрузите разговор</h3><div className="muted">mp3, wav, m4a или запись с микрофона встречи</div></div>
            <div className="step"><div className="num">02</div><h3>AI анализирует</h3><div className="muted">Расшифровка, требования, роли, противоречия и пробелы</div></div>
            <div className="step"><div className="num">03</div><h3>Получите проверяемое ТЗ</h3><div className="muted">Каждое требование связано с исходной репликой в записи</div></div>
          </section>

          <div className="sec-title">
            <h2>Проекты</h2>
            <span className="hint">{list === null ? "загрузка…" : `${list.length} ${plural(list.length)} · реальные встречи`}</span>
          </div>

          <div className="cards">
            <button className="pcard new" onClick={() => nav("/projects?id=mock")}>
              <Video size={22} /> + Демо-встреча
            </button>
            <button className="pcard new" onClick={() => fileRef.current?.click()} style={{ gridColumn: "span 1" }}>
              <Upload size={22} /> + Загрузить запись
            </button>
            {(list ?? []).map((m) => (
              <div key={m.id} className="pcard" onClick={() => nav(`/projects?id=${m.id}`)}>
                <button className="x-del" title="Удалить встречу"
                        onClick={(e) => { e.stopPropagation(); del(m); }}>
                  <X size={13} />
                </button>
                <span className={`st ${STATUS_CLASS[m.status] ?? "idle"}`}>{STATUS_RU[m.status] ?? m.status}</span>
                <h3 title={m.title}>{m.title}</h3>
                <div className="meta">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <FileAudio size={13} /> {m.requirements_count} требований · {new Date(m.created_at).toLocaleDateString("ru")}
                  </span>
                  <span className="open">Открыть →</span>
                </div>
              </div>
            ))}
          </div>

          {list !== null && list.length === 0 && (
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--mut)" }}>
              Реальных проектов пока нет — загрузите запись кнопкой «Новая встреча».
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "встреча";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "встречи";
  return "встреч";
}

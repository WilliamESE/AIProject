import { useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "./lib/api";

//Functions
function computeNamespace(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return host.split(".").slice(0, -1).join("-") || "docs";
  } catch {
    return "docs";
  }
}
function firstPathPrefix(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length ? `/${parts[0]}` : "";
  } catch {
    return "";
  }
}
function lastPathLabel(link) {
  try {
    const u = new URL(link);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || parts[0] || u.hostname;
    return decodeURIComponent(last).replace(/-/g, " ");
  } catch {
    return link;
  }
}
function isHttpUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

//Markdown renderer: code fences -> <pre.code>, rest -> <p.answer>; linkify bare URLs
function renderAnswer(text) {
  const blocks = String(text || "").split(/```/g);
  return blocks.map((seg, i) => {
    if (i % 2 === 1) {
      return (
        <pre key={i} className="code">
          {seg.trim()}
        </pre>
      );
    }
    const parts = seg.split(/(https?:\/\/[^\s)]+)(?=\)|\s|$)/gi);
    return (
      <p key={i} className="answer">
        {parts.map((p, j) =>
          /^https?:\/\//i.test(p) ? (
            <a key={j} href={p} target="_blank" rel="noreferrer">
              {p}
            </a>
          ) : (
            <span key={j}>{p}</span>
          )
        )}
      </p>
    );
  });
}

export default function App() {
  //Analyze
  const [startUrl, setStartUrl] = useState("https://nextjs.org/docs");
  const [busyAnalyze, setBusyAnalyze] = useState(false);
  const [status, setStatus] = useState("");
  const [ingestErr, setIngestErr] = useState("");

  //Chat
  const [question, setQuestion] = useState("How do I create a page with the App Router?");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [busyChat, setBusyChat] = useState(false);

  //Derived
  const ns = useMemo(() => computeNamespace(startUrl), [startUrl]);
  const isUrlValid = useMemo(() => isHttpUrl(startUrl), [startUrl]);
  const scopedPrefix = useMemo(() => firstPathPrefix(startUrl), [startUrl]);

  //Focus the chat input after analyze completes
  const askRef = useRef(null);
  useEffect(() => {
    if (!busyAnalyze && status && askRef.current) askRef.current.focus();
  }, [busyAnalyze, status]);

  async function handleAnalyze() {
    setStatus("");
    setIngestErr("");
    setBusyAnalyze(true);
    try {
      if (!isUrlValid) throw new Error("Please enter a valid http(s) URL.");

      const body = {
        startUrl,
        namespace: ns,
        pathPrefix: scopedPrefix,
        maxDepth: 1,
        maxPages: 80,
        delayMs: 200,
        title: `${new URL(startUrl).hostname} Docs`,
      };

      const data = await apiPost("/ingest-crawl", body);
      setStatus(`Indexed ${data.crawled} page(s); stored ${data.upserted} chunk(s).`);
    } catch (e) {
      setIngestErr(e?.message || "Analyze failed");
    } finally {
      setBusyAnalyze(false);
    }
  }

  async function handleAsk() {
    setBusyChat(true);
    setAnswer("");
    setSources([]);
    setIngestErr("");
    try {
      const data = await apiPost("/chat", { question, topK: 6, namespace: ns });
      setAnswer(data.answer || "");
      setSources(Array.isArray(data.sources) ? data.sources : []);
    } catch (e) {
      setAnswer("");
      setSources([]);
      setIngestErr(e?.message || "Chat failed");
    } finally {
      setBusyChat(false);
    }
  }

  return (
    <div className="app">
      {/* Analyze */}
      <div className="card">
        <h1 className="h1">DocChat</h1>
        <p className="sub">Analyze a docs site and ask questions about it</p>

        <div className="row">
          <input
            className="input"
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            placeholder="Paste a docs URL (e.g., https://nextjs.org/docs)"
            spellCheck={false}
          />
          <button
            className="button"
            onClick={handleAnalyze}
            disabled={busyAnalyze || !isUrlValid}
            title={`Namespace: ${ns}${scopedPrefix ? ` (scope: ${scopedPrefix})` : ""}`}
          >
            {busyAnalyze ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        <div className="status">
          {status && <span className="ok">{status}</span>}
          {!status && ingestErr && <span className="err">{ingestErr}</span>}
          {!isUrlValid && !busyAnalyze && <span className="err">Please enter a valid http(s) URL.</span>}
        </div>
      </div>

      {/* Chat */}
      <div className="card chat">
        <div className="chat-box">
          {answer ? (
            <>
              {renderAnswer(answer)}
              {!!sources.length && (
                <div className="sources">
                  {sources.map((s) => (
                    <a
                      key={`${s.id}-${s.url}`}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="pill"
                      title={s.url}
                    >
                      {lastPathLabel(s.url)}
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="answer">
              {busyChat ? "Thinking…" : "Ask a question after analyzing a site."}
            </div>
          )}
        </div>

        <div className="row">
          <input
            ref={askRef}
            className="input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type your question…"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) handleAsk();
            }}
          />
          <button className="button" onClick={handleAsk} disabled={busyChat || !question.trim()}>
            {busyChat ? "Sending…" : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}

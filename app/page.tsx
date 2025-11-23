"use client";

import { useEffect, useState, type FormEvent } from "react";

import { TaskDashboard } from "@/components/task-dashboard";

const PASSWORD = "2502542202";
const STORAGE_KEY = "job-manager-ui-authenticated";

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

useEffect(() => {
  let active = true;
  const schedule =
    typeof queueMicrotask === "function"
      ? queueMicrotask
      : (fn: () => void) => Promise.resolve().then(fn);

  schedule(() => {
    if (!active) {
      return;
    }
    if (typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored === "true") {
        setAuthenticated(true);
      }
    }
    setChecking(false);
  });

  return () => {
    active = false;
  };
}, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inputValue.trim() === PASSWORD) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(STORAGE_KEY, "true");
      }
      setAuthenticated(true);
      setError(null);
      setInputValue("");
      return;
    }
    setError("密码错误，请重试。");
  };

  if (checking) {
    return null;
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/90 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
          <h1 className="mb-2 text-center text-xl font-semibold text-slate-900">访问受限</h1>
          <p className="mb-6 text-center text-sm text-slate-500">请输入访问密码以打开任务调度管理系统。</p>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="输入密码"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              autoFocus
              required
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
            >
              确认
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <TaskDashboard />;
}

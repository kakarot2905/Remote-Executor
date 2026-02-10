"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, LogOut, Terminal } from "lucide-react";
import TerminalInterface from "./TerminalInterface";
import { clientAuth } from "@/lib/client-auth";

interface Tab {
  id: string;
  name: string;
}

export default function MultiNodeTerminal() {
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([{ id: "1", name: "Node 1" }]);
  const [activeTabId, setActiveTabId] = useState("1");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleLogout = async () => {
    await clientAuth.logout();
    router.push("/login");
  };

  const addTab = () => {
    const newId = Date.now().toString();
    const newTab = {
      id: newId,
      name: `Node ${tabs.length + 1}`,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;

    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      const idx = tabs.findIndex((t) => t.id === tabId);
      const newActiveId = newTabs[idx === 0 ? 0 : idx - 1].id;
      setActiveTabId(newActiveId);
    }
  };

  const startEdit = (
    tabId: string,
    currentName: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setEditingTabId(tabId);
    setEditName(currentName);
  };

  const saveEdit = (tabId: string) => {
    if (editName.trim()) {
      setTabs(
        tabs.map((t) => (t.id === tabId ? { ...t, name: editName.trim() } : t)),
      );
    }
    setEditingTabId(null);
    setEditName("");
  };

  return (
    <div className="min-h-screen  flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="px-6 py-4">
          <div className="flex  items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-5 h-5 text-primary " />
                <h1 className="text-2xl font-bold text-foreground">
                  CMD Executor
                </h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Execute commands across multiple distributed worker nodes
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Logged in as</p>
                <p className="text-sm font-medium text-foreground">
                  {clientAuth.getUser()?.username || "Unknown"}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors text-sm font-medium"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="border-t border-border px-6 flex items-center gap-2 overflow-x-auto bg-background">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex items-center gap-2 px-4 py-3 cursor-pointer transition-all border-b-2 ${
                activeTabId === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              {editingTabId === tab.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveEdit(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(tab.id);
                    if (e.key === "Escape") {
                      setEditingTabId(null);
                      setEditName("");
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  className="px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary w-32"
                />
              ) : (
                <>
                  <span
                    className="text-sm font-medium"
                    onDoubleClick={(e) => startEdit(tab.id, tab.name, e)}
                  >
                    {tab.name}
                  </span>
                  <button
                    onClick={(e) => closeTab(tab.id, e)}
                    disabled={tabs.length === 1}
                    className={`p-1 rounded transition-all ${
                      tabs.length === 1
                        ? "opacity-30 cursor-not-allowed"
                        : "opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-destructive"
                    }`}
                    title={
                      tabs.length === 1 ? "Cannot close last tab" : "Close tab"
                    }
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}

          <button
            onClick={addTab}
            className="flex items-center gap-1.5 px-3 py-3 text-sm font-medium text-primary hover:bg-primary/10 rounded transition-colors ml-auto flex-shrink-0"
            title="Add new node"
          >
            <Plus className="w-4 h-4" />
            Add Node
          </button>
        </div>
      </header>

      {/* Terminal Content */}
      <div className="flex-1 relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={activeTabId === tab.id ? "block h-full" : "hidden"}
          >
            <TerminalInterface nodeId={tab.id} nodeName={tab.name} />
          </div>
        ))}
      </div>
    </div>
  );
}

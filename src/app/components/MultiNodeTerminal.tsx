"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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
    if (tabs.length === 1) return; // Don't close last tab

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
    <div className="min-h-screen bg-black">
      {/* Main Header */}
      <div className="bg-gray-900 border-b-2 border-green-400 p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-green-400 font-mono">
            CMD Executor - Multi-Node Remote Command Runner
          </h1>
          <p className="text-xs text-green-300 mt-1">
            Upload zip files and execute commands across multiple distributed
            worker nodes
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-green-400 font-mono">
            User: {clientAuth.getUser()?.username || "Unknown"}
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-sm rounded transition-colors"
          >
            LOGOUT
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-gray-900 border-b-2 border-green-400 flex items-end">
        <div className="flex-1 flex items-end overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`relative flex items-center gap-2 px-4 py-2 cursor-pointer border-r border-green-400 transition-colors ${
                activeTabId === tab.id
                  ? "bg-black text-green-400 border-b-2 border-black"
                  : "bg-gray-800 text-green-600 hover:bg-gray-700"
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
                  className="bg-gray-900 text-green-400 border border-green-400 px-2 py-0.5 text-sm w-24"
                />
              ) : (
                <>
                  <span
                    className="text-sm font-mono"
                    onDoubleClick={(e) => startEdit(tab.id, tab.name, e)}
                  >
                    {tab.name}
                  </span>
                  <button
                    onClick={(e) => closeTab(tab.id, e)}
                    disabled={tabs.length === 1}
                    className={`text-xs hover:text-red-400 ${
                      tabs.length === 1 ? "opacity-30 cursor-not-allowed" : ""
                    }`}
                    title={
                      tabs.length === 1 ? "Cannot close last tab" : "Close tab"
                    }
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addTab}
          className="px-4 py-2 bg-green-400 text-black hover:bg-green-300 font-bold transition-colors"
          title="Add new node"
        >
          + Add Node
        </button>
      </div>

      {/* Active Terminal */}
      <div className="relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={activeTabId === tab.id ? "block" : "hidden"}
          >
            <TerminalInterface nodeId={tab.id} nodeName={tab.name} />
          </div>
        ))}
      </div>
    </div>
  );
}

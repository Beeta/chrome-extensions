import React from "react";

const SUPPORTED_SITES = [
  { name: "ChatGPT", url: "https://chatgpt.com", icon: "🤖" },
  { name: "Claude", url: "https://claude.ai", icon: "🧠" },
  { name: "Gemini", url: "https://gemini.google.com", icon: "✨" },
  { name: "Kimi", url: "https://kimi.moonshot.cn", icon: "🌙" },
  { name: "豆包", url: "https://www.doubao.com", icon: "🥟" },
  { name: "元宝", url: "https://yuanbao.tencent.com", icon: "🐧" },
  { name: "Poe", url: "https://www.poe.com", icon: "🐶" },
];

export default function App() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ fontSize: 20 }}>💬</span>
        <div>
          <div style={styles.title}>AI Chat Navigator</div>
          <div style={styles.subtitle}>问题索引浮窗</div>
        </div>
      </div>

      <p style={styles.desc}>
        打开以下任意 AI
        聊天网站，页面右下角会自动出现问题列表浮窗，点击可快速跳转。
      </p>

      <div style={styles.siteList}>
        {SUPPORTED_SITES.map((site) => (
          <a
            key={site.name}
            href={site.url}
            target="_blank"
            rel="noreferrer"
            style={styles.siteItem}
          >
            <span>{site.icon}</span>
            <span>{site.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 260,
    padding: "16px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    color: "#111827",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  title: {
    fontWeight: 700,
    fontSize: 15,
    lineHeight: 1.2,
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 12,
  },
  desc: {
    color: "#4b5563",
    lineHeight: 1.6,
    margin: "0 0 14px",
  },
  siteList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  siteItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    textDecoration: "none",
    color: "#374151",
    fontSize: 12,
    fontWeight: 500,
  },
};

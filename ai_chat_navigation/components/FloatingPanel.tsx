import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { DetectorAdapter, UserMessage } from '../detectors/index';
import { truncate } from '../detectors/utils';

interface FloatingPanelProps {
  detector: DetectorAdapter;
}

/**
 * 浮窗主组件。
 * 渲染在 Shadow DOM 内，CSS 完全隔离。
 */
export function FloatingPanel({ detector }: FloatingPanelProps) {
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [hovered, setHovered] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 初始提取 + 监听变化
  useEffect(() => {
    const initial = detector.extractUserMessages();
    setMessages(initial);

    const unsubscribe = detector.onMessagesChange((updated) => {
      setMessages(updated);
    });

    return unsubscribe;
  }, [detector]);

  // SPA 路由切换时重置（监听 URL 变化）
  useEffect(() => {
    let lastUrl = location.href;

    const id = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setMessages([]);
        setActiveIndex(null);
        // 延迟重新提取，等页面内容渲染
        setTimeout(() => {
          setMessages(detector.extractUserMessages());
        }, 1500);
      }
    }, 500);

    return () => clearInterval(id);
  }, [detector]);

  const handleClick = useCallback(
    (index: number) => {
      setActiveIndex(index);
      detector.scrollToMessage(index);
    },
    [detector],
  );

  if (messages.length === 0) return null;

  return (
    <div
      ref={panelRef}
      style={hovered ? styles.panelExpanded : styles.panelCollapsed}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 收起态：指示条列 */}
      {!hovered && (
        <div style={styles.indicators}>
          {messages.map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.indicator,
                ...(activeIndex === i ? styles.indicatorActive : {}),
              }}
            />
          ))}
        </div>
      )}

      {/* 展开态：完整列表 */}
      {hovered && (
        <>
          <div style={styles.header}>
            <span style={styles.title}>问题列表</span>
            <span style={styles.count}>{messages.length}</span>
          </div>
          <div style={styles.list}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  ...styles.item,
                  ...(activeIndex === i ? styles.itemActive : {}),
                }}
                onClick={() => handleClick(i)}
                title={msg.content}
              >
                <span style={activeIndex === i ? styles.dashActive : styles.dash}>—</span>
                <span style={styles.itemText}>{truncate(msg.content, 30)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 内联样式（注入在 Shadow DOM 内，完全隔离） ───────────────────────────────

const BASE_PANEL: React.CSSProperties = {
  position: 'fixed',
  right: '0',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 2147483647,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: '13px',
  userSelect: 'none',
  cursor: 'pointer',
};

const styles: Record<string, React.CSSProperties> = {
  panelCollapsed: {
    ...BASE_PANEL,
    width: '20px',
    padding: '16px 4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  panelExpanded: {
    ...BASE_PANEL,
    width: '260px',
    maxHeight: '70vh',
    backgroundColor: '#ffffff',
    borderRadius: '12px 0 0 12px',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.12)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    cursor: 'default',
  },
  indicators: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'center',
    width: '100%',
  },
  indicator: {
    width: '24px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: '#d1d5db',
    flexShrink: 0,
  },
  indicatorActive: {
    backgroundColor: '#111827',
    width: '28px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid #f3f4f6',
    backgroundColor: '#fafafa',
    borderRadius: '12px 0 0 0',
    cursor: 'default',
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: '13px',
    color: '#111827',
  },
  count: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '18px',
    padding: '0 5px',
    backgroundColor: '#6366f1',
    color: '#fff',
    borderRadius: '9px',
    fontSize: '11px',
    fontWeight: 600,
  },
  list: {
    overflowY: 'auto',
    flex: 1,
    padding: '6px',
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    color: '#374151',
    lineHeight: 1.4,
  },
  itemActive: {
    backgroundColor: '#ede9fe',
    color: '#4f46e5',
  },
  dash: {
    color: '#9ca3af',
    marginRight: '4px',
    flexShrink: 0,
  },
  dashActive: {
    color: '#111827',
    fontWeight: 700,
    marginRight: '4px',
    flexShrink: 0,
  },
  itemText: {
    flex: 1,
    wordBreak: 'break-word',
  },
};

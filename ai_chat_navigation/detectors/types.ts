export interface UserMessage {
  content: string;
  element: Element | null; // DOM 引用，用于 scrollIntoView；虚拟滚动时可能为 null
  index: number; // 在所有用户消息中的序号（0-based）
}

export interface DetectorAdapter {
  /** 网站名称，用于 debug */
  name: string;

  /** 判断当前页面是否是该网站 */
  canHandle(): boolean;

  /**
   * 初始化：等待聊天容器出现。
   * 因为 SPA 页面路由切换后，聊天容器可能还没挂载，需要轮询等待。
   */
  init(): Promise<void>;

  /** 提取当前对话中所有用户消息 */
  extractUserMessages(): UserMessage[];

  /**
   * 监听新的用户消息（追问）。
   * 返回一个 unsubscribe 函数，调用后停止监听。
   */
  onMessagesChange(cb: (messages: UserMessage[]) => void): () => void;

  /**
   * 滚动到指定的用户消息。
   * @param index 用户消息的序号（0-based）
   */
  scrollToMessage(index: number): void;
}

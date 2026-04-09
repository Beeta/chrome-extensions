import type { DetectorAdapter } from './types';
import { ChatGPTDetector } from './chatgpt';
import { ClaudeDetector } from './claude';
import { GeminiDetector } from './gemini';
import { KimiDetector } from './kimi';
import { DoubaoDetector } from './doubao';
import { YuanbaoDetector } from './yuanbao';
import { PoeDetector } from './poe';

export { type DetectorAdapter } from './types';
export type { UserMessage } from './types';

/**
 * DetectorManager：自动识别当前网站并返回对应的检测器。
 */
export class DetectorManager {
  private readonly detectors: DetectorAdapter[] = [
    new ChatGPTDetector(),
    new ClaudeDetector(),
    new GeminiDetector(),
    new KimiDetector(),
    new DoubaoDetector(),
    new YuanbaoDetector(),
    new PoeDetector(),
  ];

  /** 找到能处理当前页面的检测器并初始化，返回 null 表示当前网站不支持 */
  async detect(): Promise<DetectorAdapter | null> {
    const detector = this.detectors.find((d) => d.canHandle());
    if (!detector) return null;

    await detector.init();
    return detector;
  }
}

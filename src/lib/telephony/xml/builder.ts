export interface SpeakElement {
  type: 'Speak';
  text: string;
  voice?: string;
  language?: string;
}

export interface PlayElement {
  type: 'Play';
  url: string;
}

export interface DialElement {
  type: 'Dial';
  number: string;
  callerId?: string;
  timeLimit?: number;
  action?: string;
  method?: 'GET' | 'POST';
  record?: boolean | string;
  callbackUrl?: string;
  callbackMethod?: 'GET' | 'POST';
}

export interface RecordElement {
  type: 'Record';
  action?: string;
  method?: 'GET' | 'POST';
  maxLength?: number;
  playBeep?: boolean;
  transcriptionType?: 'auto' | 'hybrid' | 'manual';
  transcriptionUrl?: string;
  startOnDialAnswer?: boolean;
  redirect?: boolean;
  recordSession?: boolean;
  recordChannelType?: 'mono' | 'dual';
}

export interface HangupElement {
  type: 'Hangup';
  reason?: string;
  schedule?: number;
}

export interface WaitElement {
  type: 'Wait';
  length: number;
}

export type PlivoXmlElement =
  | SpeakElement
  | PlayElement
  | DialElement
  | RecordElement
  | HangupElement
  | WaitElement;

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds safe, valid Plivo XML without string concatenation errors.
 */
export class PlivoXmlBuilder {
  private elements: PlivoXmlElement[] = [];

  speak(text: string, options?: { voice?: string; language?: string }): this {
    this.elements.push({ type: 'Speak', text, voice: options?.voice, language: options?.language });
    return this;
  }

  play(url: string): this {
    this.elements.push({ type: 'Play', url });
    return this;
  }

  dial(
    number: string,
    options?: {
      callerId?: string;
      timeLimit?: number;
      action?: string;
      method?: 'GET' | 'POST';
      record?: boolean | string;
      callbackUrl?: string;
      callbackMethod?: 'GET' | 'POST';
    }
  ): this {
    this.elements.push({
      type: 'Dial',
      number,
      callerId: options?.callerId,
      timeLimit: options?.timeLimit,
      action: options?.action,
      method: options?.method,
      record: options?.record,
      callbackUrl: options?.callbackUrl,
      callbackMethod: options?.callbackMethod,
    });
    return this;
  }

  record(options?: Omit<RecordElement, 'type'>): this {
    this.elements.push({
      type: 'Record',
      action: options?.action,
      method: options?.method || 'POST',
      maxLength: options?.maxLength || 60,
      playBeep: options?.playBeep ?? true,
      transcriptionType: options?.transcriptionType,
      transcriptionUrl: options?.transcriptionUrl,
      startOnDialAnswer: options?.startOnDialAnswer,
      redirect: options?.redirect,
      recordSession: options?.recordSession,
      recordChannelType: options?.recordChannelType,
    });
    return this;
  }

  hangup(reason?: string, schedule?: number): this {
    this.elements.push({ type: 'Hangup', reason, schedule });
    return this;
  }

  wait(length: number): this {
    this.elements.push({ type: 'Wait', length });
    return this;
  }

  toXml(): string {
    const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>'];

    for (const el of this.elements) {
      switch (el.type) {
        case 'Speak': {
          let attrs = '';
          if (el.voice) attrs += ` voice="${escapeXml(el.voice)}"`;
          if (el.language) attrs += ` language="${escapeXml(el.language)}"`;
          parts.push(`  <Speak${attrs}>${escapeXml(el.text)}</Speak>`);
          break;
        }
        case 'Play': {
          parts.push(`  <Play>${escapeXml(el.url)}</Play>`);
          break;
        }
        case 'Dial': {
          let attrs = '';
          if (el.callerId) attrs += ` callerId="${escapeXml(el.callerId)}"`;
          if (el.timeLimit) attrs += ` timeLimit="${el.timeLimit}"`;
          if (el.action) attrs += ` action="${escapeXml(el.action)}"`;
          if (el.method) attrs += ` method="${el.method}"`;
          if (el.record !== undefined) attrs += ` record="${escapeXml(String(el.record))}"`;
          if (el.callbackUrl) attrs += ` callbackUrl="${escapeXml(el.callbackUrl)}"`;
          if (el.callbackMethod) attrs += ` callbackMethod="${el.callbackMethod}"`;
          parts.push(`  <Dial${attrs}>`);
          parts.push(`    <Number>${escapeXml(el.number)}</Number>`);
          parts.push(`  </Dial>`);
          break;
        }
        case 'Record': {
          let attrs = '';
          if (el.action) attrs += ` action="${escapeXml(el.action)}"`;
          if (el.method) attrs += ` method="${el.method}"`;
          if (el.maxLength) attrs += ` maxLength="${el.maxLength}"`;
          if (el.playBeep !== undefined) attrs += ` playBeep="${el.playBeep}"`;
          if (el.startOnDialAnswer !== undefined) attrs += ` startOnDialAnswer="${el.startOnDialAnswer}"`;
          if (el.redirect !== undefined) attrs += ` redirect="${el.redirect}"`;
          if (el.recordSession !== undefined) attrs += ` recordSession="${el.recordSession}"`;
          if (el.recordChannelType) attrs += ` recordChannelType="${el.recordChannelType}"`;
          if (el.transcriptionType) attrs += ` transcriptionType="${el.transcriptionType}"`;
          if (el.transcriptionUrl) attrs += ` transcriptionUrl="${escapeXml(el.transcriptionUrl)}"`;
          parts.push(`  <Record${attrs} />`);
          break;
        }
        case 'Hangup': {
          let attrs = '';
          if (el.reason) attrs += ` reason="${escapeXml(el.reason)}"`;
          if (el.schedule) attrs += ` schedule="${el.schedule}"`;
          parts.push(`  <Hangup${attrs} />`);
          break;
        }
        case 'Wait': {
          parts.push(`  <Wait length="${el.length}" />`);
          break;
        }
      }
    }

    parts.push('</Response>');
    return parts.join('\n');
  }
}

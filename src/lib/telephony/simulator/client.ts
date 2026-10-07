import crypto from 'node:crypto';
import {
  TelephonyProvider,
  AccountVerificationResult,
  SearchNumbersParams,
  AvailableNumberDTO,
  BuyNumberParams,
  PurchasedNumberDTO,
  ListOwnedNumbersParams,
  OwnedNumberDTO,
  UpdateNumberParams,
  CreateCallParams,
  CallResultDTO,
  CallDetailDTO,
  SendMessageParams,
  MessageResultDTO,
  MessageDetailDTO,
  RecordingDTO,
  TranscriptionOptions,
  TranscriptionResultDTO,
  PlivoTranscriptionDTO,
} from '../types';
import { computeV3Signature } from '../webhook-validator';

export class SimulatorProvider implements TelephonyProvider {
  readonly mode = 'simulator' as const;

  // In-memory simulator ledger
  private calls = new Map<string, CallDetailDTO>();
  private messages = new Map<string, MessageDetailDTO>();
  private recordings = new Map<string, RecordingDTO>();
  private ownedNumbers: OwnedNumberDTO[] = [
    {
      number: '+14155552671',
      alias: 'Main Support (Simulated)',
      appId: 'app-sim-default',
      monthlyRental: '1.0000',
      voiceRate: '0.0120',
      smsRate: '0.0075',
    },
    {
      number: '+14155552672',
      alias: 'Sales Desk (Simulated)',
      appId: 'app-sim-default',
      monthlyRental: '1.0000',
      voiceRate: '0.0120',
      smsRate: '0.0075',
    },
  ];

  constructor(private webhookSecret: string = 'sim-webhook-secret-token') { }

  async verifyCredentials(authId: string, _authToken: string): Promise<AccountVerificationResult> {
    const isFormatted = !authId || authId.startsWith('MA') || authId.startsWith('SA') || authId.startsWith('SIM');
    const authIdToUse = authId || 'SIMULATOR_AUTH_ID';
    return {
      valid: isFormatted,
      authId: authIdToUse,
      authIdLast4: authIdToUse.slice(-4),
      accountName: 'Simulated Company Telecom',
      cashCredits: '999.00',
    };
  }

  async searchNumbers(params: SearchNumbersParams): Promise<AvailableNumberDTO[]> {
    const prefix = params.prefix || '555';
    const iso = params.countryIso.toUpperCase();
    const count = Math.min(params.limit || 5, 10);
    const results: AvailableNumberDTO[] = [];

    const countryCode = iso === 'US' ? '+1' : iso === 'GB' ? '+44' : '+91';

    for (let i = 1; i <= count; i++) {
      const pad = String(i + (params.offset || 0)).padStart(4, '0');
      results.push({
        number: `${countryCode}${prefix}${pad}`,
        countryIso: iso,
        type: params.type || 'local',
        region: 'California',
        city: 'San Francisco',
        monthlyRental: '1.0000',
        smsRate: '0.0075',
        voiceRate: '0.0120',
      });
    }

    return results;
  }

  async buyNumber(params: BuyNumberParams): Promise<PurchasedNumberDTO> {
    const newNumber: OwnedNumberDTO = {
      number: params.number,
      alias: `Purchased Number (${params.number})`,
      appId: params.appId || 'app-sim-default',
      monthlyRental: '1.0000',
      voiceRate: '0.0120',
      smsRate: '0.0075',
    };
    this.ownedNumbers.push(newNumber);

    return {
      number: params.number,
      status: 'active',
      message: 'Number successfully purchased and assigned in simulator',
    };
  }

  async listOwnedNumbers(_params?: ListOwnedNumbersParams): Promise<OwnedNumberDTO[]> {
    return [...this.ownedNumbers];
  }

  async updateNumber(number: string, params: UpdateNumberParams): Promise<void> {
    const found = this.ownedNumbers.find(n => n.number === number);
    if (found) {
      if (params.appId) found.appId = params.appId;
      if (params.alias) found.alias = params.alias;
    }
  }

  async releaseNumber(number: string): Promise<void> {
    this.ownedNumbers = this.ownedNumbers.filter(n => n.number !== number);
  }

  async createCall(params: CreateCallParams): Promise<CallResultDTO> {
    const callUuid = `c1${crypto.randomBytes(15).toString('hex')}`;
    const requestUuid = `r1${crypto.randomBytes(15).toString('hex')}`;

    const detail: CallDetailDTO = {
      callUuid,
      from: params.from,
      to: params.to,
      status: 'queued',
      duration: 0,
      billDuration: 0,
      totalCost: '0.000000',
    };
    this.calls.set(callUuid, detail);

    return {
      callUuid,
      requestUuid,
      apiId: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Call created in simulator',
    };
  }

  async getCall(callUuid: string): Promise<CallDetailDTO> {
    const call = this.calls.get(callUuid);
    if (!call) {
      return {
        callUuid,
        from: '+14155552671',
        to: '+14155550199',
        status: 'completed',
        duration: 45,
        billDuration: 60,
        totalCost: '0.012000',
        hangupCause: 4000,
      };
    }
    return call;
  }

  async hangupCall(callUuid: string): Promise<void> {
    const call = this.calls.get(callUuid);
    if (call) {
      call.status = 'completed';
      call.hangupCause = 4000;
    }
  }

  async sendDigits(_callUuid: string, _digits: string, _leg?: 'aleg' | 'bleg'): Promise<void> {
    // Simulated DTMF digits accepted
  }

  async playAudio(_callUuid: string, _url: string): Promise<void> {
    // Simulated audio playback started
  }

  async speakText(_callUuid: string, _text: string): Promise<void> {
    // Simulated speech synthesizer invoked
  }

  async startCallRecording(callUuid: string, _options?: { timeLimit?: number; transcriptionType?: string }): Promise<{ recordingId: string }> {
    const recordingId = `rec_${crypto.randomBytes(12).toString('hex')}`;
    this.recordings.set(recordingId, {
      recordingId,
      recordingUrl: `https://media.plivo.com/recordings/${recordingId}.mp3`,
      durationSeconds: 30,
      callUuid,
    });
    return { recordingId };
  }

  async stopCallRecording(_callUuid: string): Promise<void> {
    // Recording stopped in simulator
  }

  async sendMessage(params: SendMessageParams): Promise<MessageResultDTO> {
    const destinations = Array.isArray(params.dst) ? params.dst : [params.dst];
    const messageUuids: string[] = [];

    for (const dst of destinations) {
      const messageUuid = `m1${crypto.randomBytes(15).toString('hex')}`;
      messageUuids.push(messageUuid);

      this.messages.set(messageUuid, {
        messageUuid,
        from: params.src || '+14155552671',
        to: dst,
        status: 'queued',
        units: 1,
        totalRate: '0.0075',
        totalAmount: '0.0075',
      });
    }

    return {
      messageUuids,
      apiId: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Message queued in simulator',
    };
  }

  async getMessage(messageUuid: string): Promise<MessageDetailDTO> {
    const msg = this.messages.get(messageUuid);
    if (!msg) {
      return {
        messageUuid,
        from: '+14155552671',
        to: '+14155550199',
        status: 'delivered',
        units: 1,
        totalRate: '0.0075',
        totalAmount: '0.0075',
      };
    }
    return msg;
  }

  async uploadMedia(files: { filename: string; buffer: Buffer; contentType: string }[]): Promise<string[]> {
    return files.map((_f, i) => `media_${crypto.randomBytes(8).toString('hex')}_${i}`);
  }

  async listRecordings(_params?: { callUuid?: string; limit?: number }): Promise<RecordingDTO[]> {
    return Array.from(this.recordings.values());
  }

  async deleteRecording(recordingId: string): Promise<void> {
    this.recordings.delete(recordingId);
  }

  async getTranscription(recordingOrTranscriptionId: string): Promise<PlivoTranscriptionDTO | null> {
    return {
      transcriptionId: recordingOrTranscriptionId,
      recordingId: recordingOrTranscriptionId,
      status: 'completed',
      text: 'Simulated carrier transcription text.',
    };
  }

  async createTranscription(recordingId: string, _options?: TranscriptionOptions): Promise<TranscriptionResultDTO> {
    const transcriptionId = `tr_${crypto.randomBytes(12).toString('hex')}`;
    return {
      transcriptionId,
      recordingId,
      status: 'queued',
      message: 'Transcription requested in simulator',
    };
  }

  async deleteTranscription(_transcriptionId: string): Promise<void> {
    // Deleted in simulator
  }

  /**
   * Generates a signed webhook request matching Plivo's real HTTP POST callback.
   */
  generateSignedWebhook(url: string, params: Record<string, any>, token?: string): {
    headers: Record<string, string>;
    body: Record<string, any>;
  } {
    const nonce = crypto.randomBytes(16).toString('hex');
    const tokenToUse = token || this.webhookSecret;
    const signature = computeV3Signature('POST', url, nonce, tokenToUse, params);

    return {
      headers: {
        'content-type': 'application/json',
        'x-plivo-signature-v3': signature,
        'x-plivo-signature-v3-nonce': nonce,
      },
      body: params,
    };
  }
}

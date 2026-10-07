import * as plivoModule from 'plivo';
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

const plivoSdk: any = (plivoModule as any).default || plivoModule;

export class PlivoProvider implements TelephonyProvider {
  readonly mode = 'live' as const;
  private client: any;

  constructor(private authId: string, private authToken: string) {
    if (!authId || !authToken) {
      throw new Error('PlivoProvider requires valid authId and authToken');
    }
    this.client = new plivoSdk.Client(authId, authToken);
  }

  async verifyCredentials(authId?: string, authToken?: string): Promise<AccountVerificationResult> {
    const targetAuthId = authId || this.authId;
    const targetAuthToken = authToken || this.authToken;
    const clientToUse = (targetAuthId === this.authId && targetAuthToken === this.authToken)
      ? this.client
      : new plivoSdk.Client(targetAuthId, targetAuthToken);

    try {
      const response = await clientToUse.accounts.get();
      return {
        valid: true,
        authId: targetAuthId,
        authIdLast4: targetAuthId.slice(-4),
        accountName: response.name || response.authId || 'Plivo Account',
        cashCredits: response.cashCredits?.toString() || '0.00',
      };
    } catch (err: any) {
      return {
        valid: false,
        authIdLast4: targetAuthId.slice(-4),
        error: err.message || 'Failed to authenticate with Plivo',
      };
    }
  }

  async searchNumbers(params: SearchNumbersParams): Promise<AvailableNumberDTO[]> {
    try {
      const queryParams: any = {
        country_iso: params.countryIso,
        limit: Math.min(params.limit || 20, 20),
        offset: params.offset || 0,
      };
      if (params.type) queryParams.type = params.type;
      if (params.prefix) queryParams.prefix = params.prefix;
      if (params.region) queryParams.region = params.region;
      if (params.city) queryParams.city = params.city;

      const response = await this.client.phoneNumbers.search(queryParams);
      const objects = response.objects || response;
      if (!Array.isArray(objects)) return [];

      return objects.map((item: any) => ({
        number: item.number,
        countryIso: item.country || params.countryIso,
        type: item.type || 'local',
        region: item.region,
        city: item.city,
        monthlyRental: item.monthlyRentalRate || item.monthly_rental_rate,
        smsRate: item.smsRate || item.sms_rate,
        voiceRate: item.voiceRate || item.voice_rate,
      }));
    } catch (err: any) {
      throw new Error(`Plivo searchNumbers error: ${err.message}`);
    }
  }

  async buyNumber(params: BuyNumberParams): Promise<PurchasedNumberDTO> {
    try {
      const buyParams: any = {};
      if (params.appId) buyParams.app_id = params.appId;
      if (params.cnam) buyParams.cnam = params.cnam;
      if (params.complianceApplicationId) buyParams.compliance_application_id = params.complianceApplicationId;

      const response = await this.client.phoneNumbers.buy(params.number, buyParams);
      return {
        number: params.number,
        status: response.status || 'active',
        message: response.message || 'Number purchased successfully',
      };
    } catch (err: any) {
      throw new Error(`Plivo buyNumber error: ${err.message}`);
    }
  }

  async listOwnedNumbers(params: ListOwnedNumbersParams = {}): Promise<OwnedNumberDTO[]> {
    try {
      const queryParams: any = {
        limit: Math.min(params?.limit || 20, 20),
        offset: params?.offset || 0,
      };
      const response = await this.client.numbers.list(queryParams);
      const objects = response.objects || response;
      if (!Array.isArray(objects)) return [];

      return objects.map((item: any) => ({
        number: item.number,
        alias: item.alias,
        appId: item.appId || item.app_id,
        monthlyRental: item.monthlyRentalRate,
        voiceRate: item.voiceRate,
        smsRate: item.smsRate,
      }));
    } catch (err: any) {
      throw new Error(`Plivo listOwnedNumbers error: ${err.message}`);
    }
  }

  async updateNumber(number: string, params: UpdateNumberParams): Promise<void> {
    try {
      const updateParams: any = {};
      if (params.appId !== undefined) updateParams.app_id = params.appId;
      if (params.alias !== undefined) updateParams.alias = params.alias;
      await this.client.numbers.update(number, updateParams);
    } catch (err: any) {
      throw new Error(`Plivo updateNumber error: ${err.message}`);
    }
  }

  async releaseNumber(number: string): Promise<void> {
    try {
      await this.client.numbers.unrent(number);
    } catch (err: any) {
      throw new Error(`Plivo releaseNumber error: ${err.message}`);
    }
  }

  async createCall(params: CreateCallParams): Promise<CallResultDTO> {
    try {
      const callParams: any = {
        from: params.from,
        to: params.to,
        answer_url: params.answerUrl,
        answer_method: 'POST',
      };
      if (params.ringUrl) {
        callParams.ring_url = params.ringUrl;
        callParams.ring_method = 'POST';
      }
      if (params.hangupUrl) {
        callParams.hangup_url = params.hangupUrl;
        callParams.hangup_method = 'POST';
      }
      if (params.fallbackUrl) {
        callParams.fallback_url = params.fallbackUrl;
        callParams.fallback_method = 'POST';
      }
      if (params.timeLimit) callParams.time_limit = params.timeLimit;
      if (params.machineDetection) callParams.machine_detection = 'true';

      const response = await this.client.calls.create(
        callParams.from,
        callParams.to,
        callParams.answer_url,
        callParams
      );

      return {
        callUuid: response.requestUuid || response.callUuid || '',
        requestUuid: response.requestUuid,
        apiId: response.apiId || '',
        message: response.message || 'Call initiated',
      };
    } catch (err: any) {
      if (err.status === 403 || err.message?.includes('Concurrency Limit')) {
        throw new Error(`Plivo Capacity Error: Concurrency limit reached (${err.message})`);
      }
      throw new Error(`Plivo createCall error: ${err.message}`);
    }
  }

  async getCall(callUuid: string): Promise<CallDetailDTO> {
    try {
      const response = await this.client.calls.get(callUuid);
      return {
        callUuid: response.callUuid || callUuid,
        from: response.from || '',
        to: response.to || '',
        status: response.callStatus || response.call_status || 'unknown',
        duration: response.duration ? Number(response.duration) : undefined,
        billDuration: response.billDuration ? Number(response.billDuration) : undefined,
        totalCost: response.totalCost?.toString(),
        hangupCause: response.hangupCause ? Number(response.hangupCause) : undefined,
      };
    } catch (err: any) {
      throw new Error(`Plivo getCall error: ${err.message}`);
    }
  }

  async hangupCall(callUuid: string): Promise<void> {
    try {
      await this.client.calls.hangup(callUuid);
    } catch (err: any) {
      throw new Error(`Plivo hangupCall error: ${err.message}`);
    }
  }

  async sendDigits(callUuid: string, digits: string, leg: 'aleg' | 'bleg' = 'aleg'): Promise<void> {
    try {
      await this.client.calls.sendDigits(callUuid, digits, { leg });
    } catch (err: any) {
      throw new Error(`Plivo sendDigits error: ${err.message}`);
    }
  }

  async playAudio(callUuid: string, url: string): Promise<void> {
    try {
      await this.client.calls.play(callUuid, [url]);
    } catch (err: any) {
      throw new Error(`Plivo playAudio error: ${err.message}`);
    }
  }

  async speakText(callUuid: string, text: string): Promise<void> {
    try {
      await this.client.calls.speak(callUuid, text);
    } catch (err: any) {
      throw new Error(`Plivo speakText error: ${err.message}`);
    }
  }

  async startCallRecording(callUuid: string, options?: { timeLimit?: number; transcriptionType?: string }): Promise<{ recordingId: string }> {
    try {
      const params: any = {
        file_format: 'mp3',
      };
      if (options?.timeLimit) params.time_limit = options.timeLimit;
      if (options?.transcriptionType) params.transcription_type = options.transcriptionType;

      const response = await this.client.calls.record(callUuid, params);
      return {
        recordingId: response.recordingId || response.recording_id || '',
      };
    } catch (err: any) {
      throw new Error(`Plivo startCallRecording error: ${err.message}`);
    }
  }

  async stopCallRecording(callUuid: string): Promise<void> {
    try {
      await this.client.calls.stopRecording(callUuid);
    } catch (err: any) {
      throw new Error(`Plivo stopCallRecording error: ${err.message}`);
    }
  }

  async sendMessage(params: SendMessageParams): Promise<MessageResultDTO> {
    try {
      const dst = Array.isArray(params.dst) ? params.dst.join('<') : params.dst;
      const sendParams: any = {
        dst,
        text: params.text,
      };
      if (params.src) sendParams.src = params.src;
      if (params.powerpackUuid) sendParams.powerpack_uuid = params.powerpackUuid;
      if (params.type) sendParams.type = params.type;
      if (params.url) {
        sendParams.url = params.url;
        sendParams.method = 'POST';
      }
      if (params.mediaUrls && params.mediaUrls.length > 0) {
        sendParams.media_urls = params.mediaUrls;
      }

      const response = await this.client.messages.create(
        sendParams.src || '',
        sendParams.dst,
        sendParams.text,
        sendParams
      );

      const messageUuids = response.messageUuid || response.message_uuid || [];
      return {
        messageUuids: Array.isArray(messageUuids) ? messageUuids : [messageUuids],
        apiId: response.apiId || '',
        message: response.message || 'Message queued',
      };
    } catch (err: any) {
      throw new Error(`Plivo sendMessage error: ${err.message}`);
    }
  }

  async getMessage(messageUuid: string): Promise<MessageDetailDTO> {
    try {
      const response = await this.client.messages.get(messageUuid);
      return {
        messageUuid: response.messageUuid || messageUuid,
        from: response.from || '',
        to: response.to || '',
        status: response.messageState || response.message_state || 'queued',
        units: response.units ? Number(response.units) : undefined,
        totalRate: response.totalRate?.toString(),
        totalAmount: response.totalAmount?.toString(),
        errorCode: response.errorCode?.toString(),
      };
    } catch (err: any) {
      throw new Error(`Plivo getMessage error: ${err.message}`);
    }
  }

  async uploadMedia(files: { filename: string; buffer: Buffer; contentType: string }[]): Promise<string[]> {
    try {
      const mediaIds: string[] = [];
      for (const file of files) {
        const response = await this.client.media.upload(file.buffer, {
          filename: file.filename,
          contentType: file.contentType,
        });
        if (response.mediaId) mediaIds.push(response.mediaId);
      }
      return mediaIds;
    } catch (err: any) {
      throw new Error(`Plivo uploadMedia error: ${err.message}`);
    }
  }

  async listRecordings(params?: { callUuid?: string; limit?: number }): Promise<RecordingDTO[]> {
    try {
      const queryParams: any = {
        limit: Math.min(params?.limit || 20, 20),
      };
      if (params?.callUuid) queryParams.call_uuid = params.callUuid;

      const response = await this.client.recordings.list(queryParams);
      const objects = response.objects || response;
      if (!Array.isArray(objects)) return [];

      return objects.map((item: any) => ({
        recordingId: item.recordingId || item.recording_id,
        recordingUrl: item.recordingUrl || item.recording_url,
        durationSeconds: item.recordingDuration ? Number(item.recordingDuration) : undefined,
        callUuid: item.callUuid || item.call_uuid,
      }));
    } catch (err: any) {
      throw new Error(`Plivo listRecordings error: ${err.message}`);
    }
  }

  async deleteRecording(recordingId: string): Promise<void> {
    try {
      await this.client.recordings.delete(recordingId);
    } catch (err: any) {
      throw new Error(`Plivo deleteRecording error: ${err.message}`);
    }
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.authId}:${this.authToken}`).toString('base64');
  }

  private async plivoRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `https://api.plivo.com/v1/Account/${this.authId}${cleanEndpoint}`;
    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      'Content-Type': 'application/json',
      ...((options.headers as any) || {}),
    };
    return fetch(url, { ...options, headers });
  }

  async getTranscription(recordingOrTranscriptionId: string): Promise<PlivoTranscriptionDTO | null> {
    try {
      const res = await this.plivoRequest(`/Transcription/${recordingOrTranscriptionId}/`);
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = await res.json();
      return {
        transcriptionId: data.transcription_id || recordingOrTranscriptionId,
        recordingId: recordingOrTranscriptionId,
        status: data.status || 'completed',
        text: data.transcription || '',
        cost: data.cost != null ? String(data.cost) : undefined,
        rate: data.rate != null ? String(data.rate) : undefined,
        durationMs: data.recording_duration_ms,
        rawPayload: data,
      };
    } catch (err: any) {
      throw new Error(`Plivo getTranscription error: ${err.message}`);
    }
  }

  async createTranscription(recordingId: string, options?: TranscriptionOptions): Promise<TranscriptionResultDTO> {
    try {
      const body: any = {};
      if (options?.transcriptionType) body.transcription_type = options.transcriptionType;
      if (options?.transcriptionUrl) body.transcription_url = options.transcriptionUrl;

      const res = await this.plivoRequest(`/Transcription/${recordingId}/`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        if (data.error && data.error.includes('already available')) {
          return {
            transcriptionId: recordingId,
            recordingId,
            status: 'completed',
            message: 'Transcription already available',
          };
        }
        throw new Error(data.error || 'Failed to request transcription');
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = await res.json();
      return {
        transcriptionId: data.transcriptionId || data.transcription_id || recordingId,
        recordingId,
        status: data.status || 'queued',
        message: data.message || 'Transcription requested from Plivo carrier',
      };
    } catch (err: any) {
      throw new Error(`Plivo createTranscription error: ${err.message}`);
    }
  }

  async deleteTranscription(transcriptionId: string): Promise<void> {
    try {
      const res = await this.plivoRequest(`/Transcription/${transcriptionId}/`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
    } catch (err: any) {
      throw new Error(`Plivo deleteTranscription error: ${err.message}`);
    }
  }
}

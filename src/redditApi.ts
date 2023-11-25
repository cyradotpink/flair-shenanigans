import { RedditOauthCredentials } from './redditAuth.ts';
import * as u from './util.ts';

type ApiResponseInfo = {
    rateLimit: {
        resetsAt: number;
        remaining: number;
        used: number;
    };
};

class RateLimiter {
    remaining: number;
    lastUpdate: number;
    constructor(public windowSize: number, public windowLimit: number) {
        this.remaining = windowLimit;
        this.lastUpdate = Date.now();
    }
    getChargeRate(): number {
        return this.windowSize / this.windowLimit;
    }
    updateRemaining() {
        const now = Date.now();
        this.remaining += (now - this.lastUpdate) / this.getChargeRate();
        this.remaining = Math.max(this.remaining, this.windowLimit);
        this.lastUpdate = now;
    }
    correct(remaining: number, lastUpdate: number) {
        this.remaining = remaining;
        this.lastUpdate = lastUpdate;
    }
    correctFromReddit(resetsIn: number, remaining: number) {
        const unitsUntilReset = resetsIn / this.getChargeRate();
        this.remaining = remaining - unitsUntilReset;
        this.correct(remaining - unitsUntilReset, Date.now());
    }
    use(): { goAhead: false; retryAfter: number } | { goAhead: true } {
        this.updateRemaining();
        if (this.remaining >= 1) {
            this.remaining -= 1;
            return { goAhead: true };
        } else {
            return {
                goAhead: false,
                retryAfter: Math.min(0, (1 - this.remaining) / this.getChargeRate())
            };
        }
    }

    queue: (() => void)[] = [];
    processQueueItem() {
        if (this.queue.length <= 0) return;
        const status = this.use();
        if (!status.goAhead) {
            setTimeout(this.processQueueItem, status.retryAfter + 1);
            return;
        }
        (this.queue.shift() as () => void)();
        if (this.queue.length > 0) setTimeout(this.processQueueItem, 0);
    }

    awaitUnit(): Promise<void> {
        return new Promise(resolve => {
            this.queue.push(resolve);
            if (this.queue.length === 1) setTimeout(this.processQueueItem, 0);
        });
    }
}

export class RedditApi {
    constructor(public credentials: RedditOauthCredentials) {}

    async callApi(
        method: string,
        path: string,
        args?: Record<string, string>
    ): Promise<u.OpResult<any>> {
        const url = new URL('https://oauth.reddit.com');
        url.pathname = path;
        url.searchParams.set('raw_json', '1');
        const body = args === undefined ? undefined : new URLSearchParams(args).toString();
        const headers: Record<string, string> = {
            Authorization: `bearer ${this.credentials.accessToken}`
        };
        if (args !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
        const request = new Request(url, {
            method,
            body,
            headers
        });
        const {
            res: response,
            ok: fetchOk,
            err: fetchErr
        } = await u.catchThisAsync(fetch, request);
        if (!fetchOk) return new u.OpFail('fetch_error', fetchErr);
        if (response.status !== 200)
            return new u.OpFail('response_not_200', {
                status: response.status,
                body: (await u.catchThisAsync([response, response.json])).res
            });
        const {
            res: json,
            ok: jsonOk,
            err: jsonErr
        } = await u.catchThisAsync([response, response.json]);
        if (!jsonOk) return new u.OpFail('json_stream_error', jsonErr);
        return new u.OpOk(json);
    }
}

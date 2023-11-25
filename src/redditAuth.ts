import * as server from './server.ts';
import config from '../config.ts';
import * as u from './util.ts';

const callbackUri = `http://localhost:${config.server.port}${config.redditAuth.callbackPath}`;

const getAuthUrl = (state: string): string => {
    const url = new URL('https://www.reddit.com/api/v1/authorize');
    url.searchParams.set('client_id', config.redditAuth.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', callbackUri);
    url.searchParams.set('duration', config.redditAuth.permanent ? 'permanent' : 'temporary');
    url.searchParams.set('scope', config.redditAuth.scopes.join(' '));
    return url.toString();
};

const generateState = (): string => {
    return Math.random().toString().substring(2);
};

export class RedditOauthCredentials {
    refreshToken: string | null;
    constructor(
        public accessToken: string,
        public expiresAfter: number,
        public refreshedAt: number,
        public scope: string[],
        refreshToken?: string
    ) {
        this.refreshToken = refreshToken ?? null;
    }
    static new(): { authUrl: string; promise: Promise<u.OpResult<RedditOauthCredentials>> } {
        const state = generateState();
        const p = new Promise<u.OpResult<RedditOauthCredentials>>(resolve => {
            oauthCallbacks[state] = resolve;
        });
        return { authUrl: getAuthUrl(state), promise: p };
    }
    async refresh(): Promise<u.VoidOpResult> {
        if (this.refreshToken === null) return new u.OpFail('token_not_permanent');
        const requestedAt = Date.now();
        const {
            res: response,
            err: fetchErr,
            ok: fetchOk
        } = await u.catchThisAsync(fetch, 'https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            body: `grant_type=refresh_token&refresh_token=${this.refreshToken}&raw_json=true`,
            headers: {
                Authorization: `Basic ${btoa(
                    `${config.redditAuth.clientId}:${config.redditAuth.clientSecret}`
                )}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        if (!fetchOk) return new u.OpFail('fetch_error', fetchErr);
        if (response.status !== 200) return new u.OpFail('api_response_not_200', response.status);
        const {
            res: json,
            err: jsonErr,
            ok: jsonOk
        } = await u.catchThisAsync([response, response.json]);
        if (!jsonOk) return new u.OpFail('json_stream_error', jsonErr);
        if (json.error !== undefined) return new u.OpFail('refresh_denied', json.error);
        this.accessToken = json.access_token;
        this.expiresAfter = json.expires_in * 1000;
        this.scope = json.scope.split(' ');
        this.refreshedAt = requestedAt;
        return new u.VoidOpOk();
    }
}

const oauthCallbacks: Record<string, (result: u.OpResult<RedditOauthCredentials>) => void> = {};

const authCallback = async (url: URL): Promise<u.OpResult<RedditOauthCredentials>> => {
    const code = url.searchParams.get('code');
    if (code === null) return new u.OpFail('callback_query_missing_code');

    const requestedAt = Date.now();
    const {
        res: response,
        err: fetchErr,
        ok: fetchOk
    } = await u.catchThisAsync(fetch, 'https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        body: `grant_type=authorization_code&code=${code}&redirect_uri=${callbackUri}&raw_json=true`,
        headers: {
            Authorization: `Basic ${btoa(
                `${config.redditAuth.clientId}:${config.redditAuth.clientSecret}`
            )}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    if (!fetchOk) return new u.OpFail('fetch_error_for_token', fetchErr);
    if (response.status !== 200) return new u.OpFail('token_response_not_200', response.status);
    const {
        res: json,
        err: jsonErr,
        ok: jsonOk
    } = await u.catchThisAsync([response, response.json]);
    if (!jsonOk) return new u.OpFail('json_stream_error_for_token', jsonErr);
    if (json.error !== undefined) return new u.OpFail('token_request_denied', json.error);
    return new u.OpOk(
        new RedditOauthCredentials(
            json.access_token,
            json.expires_in * 1000,
            requestedAt,
            json.scope.split(' '),
            json.refresh_token ?? null
        )
    );
};

const invokeAuthCallback = async (url: string): Promise<u.OpResult<RedditOauthCredentials>> => {
    const parsed = new URL(url);
    const state = parsed.searchParams.get('state') ?? '';
    const callback = oauthCallbacks[state];
    if (callback === undefined) {
        return new u.OpFail('unknown_state_in_callback_query', state);
    }
    delete oauthCallbacks[state];
    const result = await authCallback(parsed);
    callback(result);
    return result;
};

const registerRoute = () => {
    server.registerRoute({
        methods: ['GET'],
        pattern: new URLPattern({ pathname: config.redditAuth.callbackPath }),
        handler: async request => {
            const result = await invokeAuthCallback(request.url);
            if (!result.ok) {
                const content =
                    u.catchThis(JSON.stringify, result).res ??
                    JSON.stringify(new u.OpFail(result.reason));
                return new Response(content, {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    });
};
registerRoute();

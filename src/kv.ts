import * as redditAuth from './redditAuth.ts';
import * as server from './server.ts';
import * as redditApi from './redditApi.ts';
import * as u from './util.ts';
import config from '../config.ts';

let kv: Promise<Deno.Kv> | null = null;
const getKv = (): Promise<Deno.Kv> => {
    if (kv === null) kv = Deno.openKv(config.kv.path);
    return kv;
};

export const storeRedditCredentials = async (
    credentials: redditAuth.RedditOauthCredentials
): Promise<u.VoidOpResult> => {
    const kv = await getKv();
    const res = await u.catchThisAsync([kv, kv.set], ['reddit_oauth_credentials'], credentials);
    if (!res.ok) return new u.OpFail('kv_failure', res.err);
    return new u.VoidOpOk();
};

export const retrieveRedditCredentials = async (): Promise<
    u.OpResult<redditAuth.RedditOauthCredentials>
> => {
    const kv = await getKv();
    const res = await u.catchThisAsync(
        [kv, kv.get<Record<string, any>>],
        ['reddit_oauth_credentials']
    );
    if (!res.ok) return new u.OpFail('kv_failure', res.err);
    if (res.res.value === null) return new u.OpFail('no_value_in_kv');
    const data = res.res.value;
    const credentials = new redditAuth.RedditOauthCredentials(
        data.accessToken,
        data.expiresAfter,
        data.refreshedAt,
        data.scope,
        data.refreshToken
    );
    return new u.OpOk(credentials);
};

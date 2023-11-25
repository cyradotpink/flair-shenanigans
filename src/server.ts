import config from '../config.ts';

let server: Deno.HttpServer | null = null;
export const beginServing = () => {
    if (server !== null) return;
    server = Deno.serve({ port: config.server.port }, handler);
    console.log('Started serving HTTP on port', config.server.port);
};
export const stopServing = async () => {
    if (server === null) return;
    await server.shutdown();
    server = null;
    console.log('Stopped serving HTTP on port', config.server.port);
};

type ServerRoute = {
    methods: string[];
    pattern: URLPattern;
    handler: (request: Request) => Promise<Response>;
};
const routes: ServerRoute[] = [];

export const registerRoute = (route: ServerRoute) => {
    routes.push(route);
};

const handler = (request: Request): Promise<Response> => {
    let handler = (_r: Request): Promise<Response> =>
        new Promise(resolve => resolve(new Response('404\n', { status: 404 })));
    for (const _route of routes) {
        if (_route.methods.includes(request.method) && _route.pattern.exec(request.url)) {
            handler = _route.handler;
            break;
        }
    }
    return handler(request);
};

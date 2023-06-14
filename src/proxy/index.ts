import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import {Resolver} from "node:dns/promises";
import fs from "node:fs"
import { SecureContext, TLSSocket, createSecureContext } from "node:tls";
import httpProxyNs from "http-proxy"
import ipc from "node-ipc";
import { getDomainBaseName } from "../common/util";
import { CommonConfig } from "../common/types";


ipc.config.stopRetrying = false;
ipc.config.silent = true;

const configFile = fs.readFileSync("./test/config.json", "utf-8");
const config = JSON.parse(configFile) as CommonConfig
const domainCerts: Record<string, string> = {}

const getCertForDomain = (domain: string): string => {
    const base = getDomainBaseName(domain);
    if(domainCerts[base]) return domainCerts[base];
    const cert = fs.readFileSync(`${config.certsDir}/nonroot/${base}.crt`, "utf-8");
    domainCerts[base] = cert;
    return cert;
}

const pk = fs.readFileSync(`${config.certsDir}/root.pem`);
const key = crypto.createPrivateKey({
   key: pk,
   // TODO: make the passphrase not stupid
   passphrase: 'whatever'
}).export({
    format: "pem",
    type: "pkcs8"
   });

const rootCert = fs.readFileSync(`${config.certsDir}/root.crt`)

// TODO: make async
 function getSecureContext (domain: string): SecureContext {
    const context = createSecureContext({
        key,
        cert: getCertForDomain(domain),
        ca: [rootCert],

    });
    return context;
}


const secureContext: Record<string, SecureContext> = {

}

 const httpsOptions: https.ServerOptions = {
    SNICallback:  (domain, cb) =>  {
        const ctx =  secureContext[domain];
        cb(ctx ? null : new  Error(`No cert found for ${domain}`), ctx)
    },
    ca: [rootCert],
    enableTrace: false,
}

const httpsProxy = httpProxyNs.createProxyServer({
    secure: true,
    followRedirects: true,
    ssl: {
        ...httpsOptions,
        // enableTrace: true,
    }
});

const httpProxy = httpProxyNs.createProxyServer({
    secure: false,
    followRedirects: true
    
})

let isConnected = false;

const resolver = new Resolver();

// TODO: get this from proper config 
resolver.setServers(["4.4.4.4", "8.8.8.8"]);


const resolutions: Record<string, string> = {

}

const resolve = async (host: string): Promise<string|null> => {
    if(resolutions[host]) {
        return resolutions[host];
    }
    try {
        const resolved = await resolver.resolve(host, "A");
        resolutions[host] = resolved[0];
    } catch {
        const resolved = await resolver.resolve(host, "AAAA");
        resolutions[host] = resolved[0];
    }
    if(!resolutions[host]) {
        return null
    }
    return resolve(host);
}

type RequestData = {
    ts: number;
    url: string;
    headers: http.IncomingHttpHeaders;
    protocol: string;
    // TODO: type
    method: string;
    body: Buffer | null;
    host: string;
}

type ResponseData = {
    data: Buffer | null;
    status: number;
    headers: http.OutgoingHttpHeaders;
    ts: number;
}

type NetworkLog = {
    request: RequestData;
    response: ResponseData;
}

// TODO: refactor to use a proper expiring cache
const requestDataStore: Record<string, RequestData> = {}

const onStart = (req: http.IncomingMessage) => {
    const id = crypto.randomUUID();
    (req as any)._requestID = id;
    const ts = new Date().valueOf();
    (req as any)._startEventTimestamp = ts;

}
const onProxyReq = (_proxyRequest: http.ClientRequest, req: http.IncomingMessage, _res: http.ServerResponse<http.IncomingMessage>) => {
    const id = (req as any)._requestID;
    if(!id) {
        console.warn("unable to find ID");
        return
    }
    const ts = (req as any)._startEventTimestamp;
    const bodyParts: Buffer[] = [];
    let body: Buffer | null = null;
    const onData = (chunk: Buffer) => {
        bodyParts.push(chunk)
    }
    const protocol =(req.socket as TLSSocket).encrypted ? "https:" : "http:";
    const url = `${protocol}//${req.headers["host"]}${req.url}`;
    req.on("data", onData).once("end", () => {
        body = Buffer.concat(bodyParts)
        req.off("data", onData)
        const requestData: RequestData = {
            method: req.method!,
            headers: req.headers,
            body: body.length ? null : body,
            url,
            ts,
            host: req.headers.host!,
            protocol
        }
        requestDataStore[id] = requestData;
    })
}
const onProxyRes = (proxyRes: http.IncomingMessage, req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage>) => {
    const id = (req as any)._requestID;
    if(!id) {
        console.warn("unable to find ID");
        return
    }
    const request = requestDataStore[id];
    const {url, method, ts, body } = request
    const dataParts: Buffer[] = [];
    let data: Buffer | null = null;
    const onData = (chunk: Buffer) => {
        dataParts.push(chunk)
    }
    const onEnd = () => {
        res.off("data", onData);
        res.off("end", onEnd);
        data = Buffer.concat(dataParts);
        data = data.length ? data : null;
        const status = proxyRes.statusCode!;
        const response: ResponseData = {
            status,
            headers: res.getHeaders(),
            data,
            ts: new Date().valueOf()
        }
        console.log(`[${new Date(ts).toUTCString()}] ${method} ${url} ${status}`, body?.length ?? 0, data?.length ?? 0 );
        if(isConnected) {
            const body: NetworkLog = {
                request, 
                response
            }
            try {
                ipc.of.netmon.emit("http", body);
                delete requestDataStore[id];
            } catch(err) {
                console.error(err)
            }
        } else {
            console.log("not connected to socket; unable to send event")
        }
    }
    proxyRes.on("data", onData).on("end", onEnd)

}

httpsProxy.on("start", onStart).on("proxyReq", onProxyReq).on("proxyRes", onProxyRes)
httpProxy.on("start", onStart).on("proxyReq", onProxyReq).on("proxyRes", onProxyRes)


const handler = (req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage>) => {
    const host = req.headers.host;
    if(!host) {
        res.write(Buffer.from("<html><body><h1>hello</h1><body></html>", "utf-8"))
        res.end();
        return;
    }
    const protocol = (req.socket as TLSSocket).encrypted ? "https:" : "http:";
    const port = protocol === "https:" ? 443 : 80
    const url = protocol + "//" + host + req.url;
    const cert = getCertForDomain(host);
    if(!cert) {
        throw new Error(`unable to find certificate for domain ${host}`);
    }
        const extras = protocol === "https:" ? {
            cert,
            key: key.toString("utf-8"),
        } : {}
        const proxyWebCallback: httpProxyNs.ErrorCallback<Error, http.IncomingMessage, http.ServerResponse<http.IncomingMessage>> = (err, _req, res, _tgt) => {
            if(err) {
                console.error(err);
                res.end()
            }
            return res;
        }
        const p = protocol === "https:" ? httpsProxy : httpProxy;
        const ns = protocol === "https:" ? https : http;
            p.web(req, res, {
                target: {
                    protocol,
                    port,
                    host,
                    href: url,
                    ...extras
                },
                followRedirects: true,
                changeOrigin: true,
                agent: new ns.Agent({
                    lookup: (hostname, opts, cb) => {
                        resolve(hostname).then((address)=> {
                            if(address) {
                                // TODO: find a better way to do this
                                const family = opts.family ?? address.split(".").length === 4 ? 4 : 6;
                                // types are bad, that's why there is an "as any" cast below
                                cb(null, [{address, family}] as any, family)
                            } else {
                                cb(new Error(`Could not resolve ${hostname}`), "", 4)
                            }
                        }).catch(err => {
                            console.error("error resolving IP address", err)
                        })
                    }
                }),
                headers: {
                    host
                },
            }, proxyWebCallback)
 }


const server443 = https.createServer(httpsOptions, handler);

 const load = async () => {
    const promises = config.domains.map(resolve)
    await Promise.all(promises);
    config.domains.forEach(domain => {
        secureContext[domain] = getSecureContext(domain)
    })
}
void load().then(() => {
    http.createServer(handler).listen(80, config.hostIP, () => {
        console.log("listening on port 80");
        server443.listen(443, config.hostIP, () => {
            console.log("listening on port 443")
        })
        try { 
            ipc.connectTo("netmon", () => {
                console.log("connected to socket")
                isConnected = true;
            });
        } catch(err) {
            console.warn("couldn't connect to ipc socket")
        }
    })
})
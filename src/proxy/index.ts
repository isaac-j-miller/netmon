import http from "http";
import https from "https";
import httpProxy from "http-proxy"
import ipc from "node-ipc";
import {Resolver} from "dns/promises";
import fs from "fs"
import { TLSSocket } from "tls";

ipc.config.stopRetrying = false;
ipc.config.silent = true;

const proxy = httpProxy.createProxyServer({
    changeOrigin: false,
    secure: false,
    followRedirects: true
});

let isConnected = false;

const resolver = new Resolver();
// TODO: get this from proper config
resolver.setServers(["4.4.4.4", "8.8.8.8"]);

const toPreload = ["example.com"]

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

const preloadDNS = async () => {
    const promises = toPreload.map(resolve)
    await Promise.all(promises);
}

const handler = (req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage>) => {
    const ts = new Date().valueOf();
    const host = req.headers.host;
    if(!host) {
        res.write(Buffer.from("<html><body><h1>hello</h1><body></html>", "utf-8"))
        res.end();
        return;
    }
    console.log(host)
    const protocol = (req.socket as TLSSocket).encrypted ? "https" : "http";
    const url = protocol + "://" + host;
    const bodyParts: any[] = [];
    let body: string | null = null;
    const onData = (chunk: any) => {
        bodyParts.push(chunk)
    }
    resolve(host).then(addr => {
        if(addr===null) {
            res.statusCode = 502;
            res.write("<html><body><h1>unable to resolve hostname</h1><body></html>");
            res.end();
            return;
        }
        req.on("data", onData).once("end", () => {
            body = Buffer.concat(bodyParts).toString();
            req.off("data", onData)
        })
        console.log(`resolved ${host} -> ${addr}`)
        proxy.on("proxyRes", (proxyRes, _res) => {
            console.log(`[${new Date(ts).toUTCString()}] ${req.method} ${url} ${proxyRes.statusCode}`, body);
            if(isConnected) {
                try {
                    ipc.of.netmon.emit("http", {
                     ts,
                     method: req.method, 
                     url: req.url,
                     host,
                     protocol,
                     data: req.read()
                    });
                } catch(err) {
                    console.error(err)
                }
            } else {
                console.log("not connected to socket; unable to send event")
            }
           })
        proxy.web(req, res, {
            target: `${protocol}://${addr}`,
            
            headers: {
                host
            }
        }, (err, req, res, _tgt) => {
            console.log(`[${new Date(ts).toUTCString()}] ${req.method} ${url} ${(res  as any).statusCode}`, req.headers);
            if(err) {
                console.error(err);
            }
            return res;
        })
    })
 }

 // TODO: figure out how to make this dynamic depending on host?
 const options: https.ServerOptions = {
    key: fs.readFileSync("./test/privatekey.pem"),
    cert: fs.readFileSync("./test/certificate.crt"),
 }

 const server443 = https.createServer(options, handler);
void preloadDNS().then(() => {
    http.createServer(handler).listen(80, () => {
        console.log("listening on port 80");
        server443.listen(443, () => {
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
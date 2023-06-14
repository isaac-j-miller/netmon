import path from "node:path"
import fs from "node:fs/promises"
import {parseArgs} from "node:util"
import { CSROptions, OpenSSLCA } from "./openssl";
import { getDomainBaseName } from "../common/util";
import { CommonConfig } from "../common/types";


type Config = CommonConfig & {
    options: CSROptions;
}

type ParsedArgs = {
    config: Config;
    out: string;
}


// TODO: make this not stupid
const passphrase = "whatever";

const parsedArgs = parseArgs({
    options: {
        "config-json": {
            type: "string",
        },
        out: {
            type: "string",
            short: "o"
        }
    }
})
const getArgs = async (): Promise<ParsedArgs> => {
    const configArg = parsedArgs.values["config-json"];
    if(!configArg) {
        throw new Error("--config-json is required")
    }
    const configPath = path.resolve(configArg);
    const file = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(file) as Config;
    const out = parsedArgs.values.out;
    if(!out) {
        throw new Error("--out is required")
    }
    return { config: parsed, out }
}

const groupByRootDomain = (domains: string[]): Record<string, string[]> => {
    const grouped: Record<string, string[]> = {};
    domains.forEach(domain => {
        const split = domain.split(".");
        if(split.length <=2) {
            grouped[domain] = [...(grouped[domain] ?? []), domain]
            return;
        }
        const baseName = getDomainBaseName(domain)
        grouped[baseName] = [...(grouped[baseName] ?? []), domain]
    });
    Object.entries(grouped).forEach(([key, values]) => {
        grouped[key] = Array.from(new Set(values)).sort((a, b)=>a.length-b.length);
    })
    return grouped;
}

const main = async () => {
    const {config, out} = await getArgs();
    const {hostIP, domains, certsDir, options, tempDir} = config;
    const dirname = path.resolve(certsDir);
    const certFilename = path.join(dirname, "root.crt");
    const keyFilename = path.join(dirname, "root.pem");
    const nonRootCertsDir = path.join(dirname, "nonroot");
    const getCertFileName = (domain: string) =>  {
        return path.join(nonRootCertsDir, `${domain}.crt`)
    }
    await fs.mkdir(nonRootCertsDir, {
        recursive: true
    });
    const resolved = path.resolve(tempDir)
    await fs.mkdir(resolved, {recursive: true});
    const rootCA = await OpenSSLCA.createRootCA(resolved, keyFilename, certFilename, passphrase, options);
    const grouped = groupByRootDomain(domains);
    for await (const [domain, subdomains] of Object.entries(grouped)) {
        const certFilename = getCertFileName(domain)
        await rootCA.generateSignedCertificate(certFilename, {
            ...options, 
            domain
        }, {
            domains: subdomains,
            ips: [hostIP]
        })
    }
    const toLog = {
        rootKey: rootCA.rootKeyPath,
        rootCert: rootCA.rootCertPath,
        nonRootCertsDir
    }
    const outData = JSON.stringify(toLog, null, 2)
    await fs.writeFile(path.resolve(out),outData, 'utf8')
    console.log(outData);
}


main().then(()=>{
    console.log("done")
}).catch(err=>{
    console.error(err)
})
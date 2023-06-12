import {exec} from "node:child_process";
import { randomUUID } from "node:crypto";
import {mkdir, writeFile} from "node:fs/promises";

export type CSROptions = {
    country: string;
    state: string;
    city: string;
    company: string;
    domain: string;
}

export type ExtFileOptions = {
    domains: string[];
    ips: string[];
}


const  getSubjectArg = (options: CSROptions): string => {
    return `-subj "/C=${options.country}/ST=${options.state}/L=${options.city}/O=${options.company}/OU=./CN=${options.domain}"`
}
const execCmd = (cmd: string): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
        if(err) {
            console.log(stdout)
            console.error(stderr)
            reject(err)
        } else {
            resolve()
        }
    })
    })
}
const  createExtfile = async (options: ExtFileOptions, filename: string) => {
    const contents = generateExtfileContents(options);
    await writeFile(filename, contents, "utf-8");
}
const generateExtfileContents =(options: ExtFileOptions): string => {
    const base: string[] = []
    base.push("authorityKeyIdentifier=keyid,issuer");
    base.push("basicConstraints=CA:FALSE");
    base.push("subjectAltName = @alt_names");
    base.push("[alt_names]");
    options.domains.forEach((value, idx) => {
        const line = `DNS.${idx+1} = ${value}`;
        base.push(line);
    })
    options.ips.forEach((value, idx) => {
        const line = `IP.${idx+1} = ${value}`;
        base.push(line);
    })
    return base.join("\n");
}

export class OpenSSLCA {
    private constructor(readonly tempDir: string, readonly rootKeyPath: string, readonly rootCertPath: string, readonly passphrase: string) {

    }
    private async signCSR(csrfile: string, outfile: string, extfile: string) {
        console.log("signing CSR")
        const cmd = `openssl x509 -req -passin pass:"${this.passphrase}" -CA ${this.rootCertPath} -CAkey ${this.rootKeyPath} -in ${csrfile} -out ${outfile} -days 365 -CAcreateserial -extfile ${extfile}`
        await execCmd(cmd)
    }
    private async generateCSR(outfile: string, options: CSROptions) {
        console.log("generating CSR for "+options.domain)
        const cmd = `openssl req -passin pass:"${this.passphrase}" -key ${this.rootKeyPath} -new -out ${outfile} ${getSubjectArg(options)}`
        await execCmd(cmd)
    }
    async generateSignedCertificate(outfile:  string, csrOptions: CSROptions, certOptions: ExtFileOptions) {
        const uuid = randomUUID();
        const baseDir = `${this.tempDir}/${uuid}`;
        await mkdir(baseDir, {
            recursive: true
        })
        const tmpfile = `${baseDir}/${csrOptions.domain}.csr`;
        await this.generateCSR(tmpfile, csrOptions);
        const extfile = `${baseDir}/${csrOptions.domain}.ext`;
        await createExtfile(certOptions, extfile);
        await this.signCSR(tmpfile, outfile, extfile);
    }
    static async createRootCA(tempDir: string, keyout: string, certout: string, passphrase: string, options: CSROptions): Promise<OpenSSLCA> {
        const cmd = `openssl req -passin pass:"${passphrase}" -passout pass:"${passphrase}" -x509 -sha256 -days 1825 -newkey rsa:2048 -keyout ${keyout} -out ${certout} ${getSubjectArg(options)}`
        console.log("generating root CA")
        await execCmd(cmd);
        return new OpenSSLCA(tempDir, keyout, certout, passphrase);
    }
}
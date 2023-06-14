import cp from "node:child_process";
import { setInterval } from "node:timers/promises";
import { NetstatAddress, NetstatLog, NetstatProto, NetstatState, NetstatUser } from "./types";
import { CommonConfig } from "../../common/types";



export class NetstatMonitor {
    constructor(private readonly config: CommonConfig) {
        
    }
    private parseUser(usrString: string): NetstatUser | null {
        const trimmed = usrString.trim();
        if(trimmed === "-") {
            return null
        }
        const [id, name] = trimmed.split("/");
        return {
            name,
            pid: Number.parseInt(id)
        }
    }
    private parseAddress(address: string): NetstatAddress {
        const splitByColon = address.split(":");
        const port = Number.parseInt(splitByColon[splitByColon.length - 1]);
        if(splitByColon.length === 2) {
            return {
                family: 4, 
                address: splitByColon[0],
                port
            }
        }
        const remainingIpv6 = splitByColon.slice(0, splitByColon.length - 1).join(":");
        return {
            family: 6, 
            address: remainingIpv6,
            port
        }
    }
    private parseLine(line1: string, ts: number): NetstatLog {
        const parts = line1.split(/\s+/g);
        const [Protocol, RecvQ, SendQ, localAddress, foreignAddress, State, ...processInfoParts] = parts;
        const processInfo = processInfoParts.join(" ");
        const Process =this.parseUser(processInfo)
        return {
            Protocol: Protocol as NetstatProto,
            RecvQ: Number.parseInt(RecvQ, 10),
            SendQ: Number.parseInt(SendQ, 10),
            LocalAddress: this.parseAddress(localAddress),
            ForeignAddress: this.parseAddress(foreignAddress),
            State: State === "-" ? null : State as NetstatState,
            Process,
            Timestamp: ts
        }

    }
    async spawn(): Promise<NetstatLog[]> {
        return new Promise<NetstatLog[]>((resolve, reject) => {
            const ts = new Date().valueOf()
            cp.exec(`netstat -tnpW 2>/dev/null | grep ${this.config.hostIP} || true`, (err, stdout, stderr) => {
                if(err) {
                    console.error(stderr);
                    reject(err);
                    return;
                }
                const lines = stdout.split("\n");
                const logs: NetstatLog[] = [];
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if(!trimmed||trimmed.startsWith("(Not all processes")||trimmed.endsWith("see it all.)")){
                        return
                    }
                    const parsed = this.parseLine(line, ts);
                    // TODO: check if ipv6
                    if(parsed.Process === null || (parsed.ForeignAddress.port !== 443 && parsed.ForeignAddress.port !==80) || parsed.ForeignAddress.address !==  this.config.hostIP) {
                        return
                    }
                    logs.push(parsed)
                })
                resolve(logs);
            })
        })
    }
    async start(delay: number) {
        const interval = setInterval(delay);
        for await (const _ of interval) {
            const logs = await this.spawn();
            if(logs.length > 0) {
                console.log(logs);
            }
        }
    }   
}
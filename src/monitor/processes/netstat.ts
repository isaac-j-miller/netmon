import cp from "node:child_process";
import { setInterval } from "node:timers/promises";
import { NetstatData, NetstatLog, NetstatProcess, NetstatUser } from "./types";



export class NetstatMonitor {
    constructor() {
        
    }
    private parseUser(usrString: string): NetstatUser {
        const sections = usrString.split(",");
        const [name, ...kvStrings] = sections;
        const data: Partial<NetstatUser> = {
            name: name.slice(1, name.length-1),
        }
        kvStrings.forEach(kv=>{
            const [k, v] = kv.split("=");
            data[k as "pid"|"fd"] = Number.parseInt(v)
        })
        return data as NetstatUser;

    }
    private parseProcess(data: string): NetstatProcess {
        const sectionsOfData = data.split("),(").map(s=>s.replace(/\(|\)/g, ""));
        const users = sectionsOfData.map(s=>this.parseUser(s));
        return {
            users
        }
    }
    private parseData(dataString: string): NetstatData {
        const data: NetstatData = {}
        let currentKey = "";
        let currentVal = "";
        let isInKey = true;
        Array.from(dataString).forEach(char => {
            if(isInKey) {
                if(char === ":") {
                    isInKey = false;
                    return;
                }
                currentKey+=char;
            } else {
                if(char === " ") {
                    isInKey = true;
                    data[currentKey] = currentVal;
                    currentKey = "";
                    currentVal = "";
                    return;
                }
                currentVal+=char;
            }
        });
        return data;
    }
    private parseLine(line1: string): NetstatLog {
        const idxOfUsers = line1.indexOf("users:");
        const firstPart = line1.slice(0, idxOfUsers);
        const secondPart = line1.slice(idxOfUsers).trim();
        const sections = firstPart.split(/\s/).filter(s=>!!s).map(s=>s.trim())
        const [State, RecvQ, SendQ, LocalAddress, PeerAddress ] = sections;
        const data = this.parseData(secondPart)
        const {users, ...Data} = data;
        if(!users) {
            console.log("no user")
            console.log(line1)
            console.log(sections)
            console.log(data)
            console.log(secondPart)
        }
        const Process = this.parseProcess(users);
        return {
            State,
            RecvQ,
            SendQ,
            LocalAddress,
            PeerAddress,
            Process,
            Data
        }

    }
    async spawn(): Promise<NetstatLog[]> {
        return new Promise<NetstatLog[]>((resolve, reject) => {
            cp.exec("ss -rnptiHO", (err, stdout, stderr) => {
                if(err) {
                    console.error(stderr);
                    reject(err);
                    return;
                }
                const lines = stdout.split("\n");
                const logs: NetstatLog[] = [];
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if(!trimmed){
                        return
                    }
                    const parsed = this.parseLine(line);
                    logs.push(parsed)
                })
                resolve(logs);
            })
        })
    }
    async start(delay: number) {
        const interval = setInterval(delay);
        for await (const _ of interval) {
            await this.spawn();
            // console.log(logs);
        }
    }   
}
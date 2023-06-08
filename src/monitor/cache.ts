import {NetstatLog, TcpDumpLog} from "./processes/types";

type CorrelatedLog = {
    tcpdump: TcpDumpLog;
    netstat: NetstatLog;
}

type PidRecord = {
    pid: number;
    procStart?: number;
    procEnd?: number;
    correlatedLogs: CorrelatedLog[]
}

export class CorrelatorCache {
    private netstatLogs: NetstatLog[];
    private tcpDumpLogs: TcpDumpLog[];
    private correlatedLogs: Record<number, CorrelatedLog>;
    constructor() {
        this.netstatLogs = [];
        this.tcpDumpLogs = [];
        this.correlatedLogs = {}
    }
    addNetstatLog(log: NetstatLog): void {
        this.netstatLogs.push(log);
    }
    addTcpDumpLog(log: TcpDumpLog): void {
        this.tcpDumpLogs.push(log);
    }
    correlateLogs() {
        // TODO: figure out how to correlate logs
        throw new Error("Not implemented")
    }
    getPidRecords(): PidRecord[] {
        // TODO: process correlatedLogs and clear
        throw new Error("Not implemented")
    }
}
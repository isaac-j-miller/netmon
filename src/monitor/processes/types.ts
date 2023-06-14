export type NetstatUser = {
    name: string, 
    pid: number,
}

// TODO: complete this
export type NetstatState = "ESTABLISHED" | "TIME_WAIT" | "SYN_SENT" | "SYN_RECV" | "FIN_WAIT1" | "FIN_WAIT2" | "CLOSE" | "CLOSE_WAIT" | "LAST_ACK" | "LISTEN" | "CLOSING" | "UNKNOWN"

export type NetstatProto = "tcp" | "udp" | "udpl" | "raw";

export type NetstatLog = {
    Protocol: NetstatProto
    RecvQ: number
    SendQ: number
    LocalAddress: NetstatAddress
    ForeignAddress: NetstatAddress
    State: NetstatState | null
    Process: NetstatUser | null
    Timestamp: number
}

export type NetstatAddress = {
    address: string;
    family: 4 | 6;
    port: number;
}
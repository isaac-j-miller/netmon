export type NetstatUser = {
    name: string, 
    pid: number,
    fd: number,
}

export type NetstatProcess = {
    users: NetstatUser[]
}

// TODO: type this better
export type NetstatData = Record<string, string>

export type NetstatLog = {
    State: string
    RecvQ: string
    SendQ: string
    LocalAddress: string
    PeerAddress: string
    Process: NetstatProcess
    Data: NetstatData
}

export type TcpDumpLog = {

}
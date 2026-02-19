export interface PeerInfo {
  addr: string;
  services: string;
  lastsend: number;
  lastrecv: number;
  conntime: number;
  version: number;
  inbound: boolean;
  startingheight: number;
}

export interface NetworkInfo {
  balance: number;
  blocks: number;
  connections: number;
  proxy: string;
  generate: boolean;
  genproclimit: number;
  difficulty: number;
}

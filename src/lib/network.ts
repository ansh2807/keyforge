import { BlockList, isIP } from "node:net";

const blockedIpv4Networks = new BlockList();
const blockedIpv6Networks = new BlockList();

const blockedIpv4Ranges: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const blockedIpv6Ranges: Array<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

for (const [address, prefix] of blockedIpv4Ranges) {
  blockedIpv4Networks.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of blockedIpv6Ranges) {
  blockedIpv6Networks.addSubnet(address, prefix, "ipv6");
}

export function isUnsafeNetworkAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) return true;
  return version === 4
    ? blockedIpv4Networks.check(address, "ipv4")
    : blockedIpv6Networks.check(address, "ipv6");
}

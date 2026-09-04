# keccak-256 pur python (FIPS-202 / Keccak original padding 0x01)
_RC=[0x0000000000000001,0x0000000000008082,0x800000000000808A,0x8000000080008000,
0x000000000000808B,0x0000000080000001,0x8000000080008081,0x8000000000008009,
0x000000000000008A,0x0000000000000088,0x0000000080008009,0x000000008000000A,
0x000000008000808B,0x800000000000008B,0x8000000000008089,0x8000000000008003,
0x8000000000008002,0x8000000000000080,0x000000000000800A,0x800000008000000A,
0x8000000080008081,0x8000000000008080,0x0000000080000001,0x8000000080008008]
_R=[[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]]
M=(1<<64)-1
def _rol(x,n): n%=64; return ((x<<n)|(x>>(64-n)))&M
def _keccak_f(A):
    for rnd in range(24):
        C=[A[x][0]^A[x][1]^A[x][2]^A[x][3]^A[x][4] for x in range(5)]
        D=[C[(x-1)%5]^_rol(C[(x+1)%5],1) for x in range(5)]
        for x in range(5):
            for y in range(5): A[x][y]^=D[x]
        B=[[0]*5 for _ in range(5)]
        for x in range(5):
            for y in range(5): B[y][(2*x+3*y)%5]=_rol(A[x][y],_R[x][y])
        for x in range(5):
            for y in range(5): A[x][y]=B[x][y]^((~B[(x+1)%5][y])&M&B[(x+2)%5][y])
        A[0][0]^=_RC[rnd]
    return A
def keccak256(data:bytes)->bytes:
    rate=136
    A=[[0]*5 for _ in range(5)]
    m=bytearray(data)
    m.append(0x01)
    while len(m)%rate: m.append(0x00)
    m[-1]^=0x80
    for off in range(0,len(m),rate):
        blk=m[off:off+rate]
        for i in range(rate//8):
            lane=int.from_bytes(blk[i*8:i*8+8],'little')
            A[i%5][i//5]^=lane
        A=_keccak_f(A)
    out=b''
    for i in range(4): out+=A[i%5][i//5].to_bytes(8,'little')
    return out[:32]
def sel(sig:str)->str: return '0x'+keccak256(sig.encode()).hex()[:8]
if __name__=='__main__':
    for s in ["name()","symbol()","decimals()","version()","DOMAIN_SEPARATOR()",
              "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
              "authorizationState(address,bytes32)","implementation()","nonces(address)",
              "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
              "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)"]:
        print(sel(s),s)
    print('typehash',  '0x'+keccak256(b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)").hex())

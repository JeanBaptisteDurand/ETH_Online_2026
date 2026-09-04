import unittest
from tare.keccak import keccak256

class TestKeccak(unittest.TestCase):
    def test_empty_vector(self):
        self.assertEqual(keccak256(b"").hex(),
            "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")

    def test_abc_vector(self):
        self.assertEqual(keccak256(b"abc").hex(),
            "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45")

    def test_known_selector_transfer_with_authorization(self):
        sig = b"transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)"
        self.assertEqual(keccak256(sig)[:4].hex(), "e3ee160e")

    def test_known_selector_extsload(self):
        self.assertEqual(keccak256(b"extsload(bytes32)")[:4].hex(), "1e2eaeaf")

    def test_eip712_domain_typehash(self):
        sig = b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        self.assertEqual(keccak256(sig).hex(),
            "8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f")

    def test_initialize_event_topic(self):
        from tare.consts import TOPIC_INITIALIZE
        sig = b"Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"
        self.assertEqual("0x" + keccak256(sig).hex(), TOPIC_INITIALIZE)

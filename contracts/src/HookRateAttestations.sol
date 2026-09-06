// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title HookRateAttestations
 * @notice The field the hook registry does not have.
 *
 * Uniswap's official hook registry describes a hook with fourteen permission booleans, four
 * property booleans, an enum and a chain id. Not one of those fields is a quantity. Two hooks it
 * describes identically can take nothing and eleven percent, and a consumer choosing between them
 * has nothing to go on.
 *
 * TARE measures that quantity off-chain, by counterfactual: on a fork pinned to one block, the
 * hook's bytecode is replaced by an inert 89-byte stub, the same swap is quoted twice, and the
 * difference is what the hook took. That measurement cannot happen on-chain — a counterfactual
 * needs a fork. But its RESULT can live here, where a router, a wallet or another contract can
 * read it.
 *
 * WHAT THIS CONTRACT IS NOT
 *
 * It is not an oracle and it is not authoritative. Every record is an ATTESTATION: a named
 * address states that, at a named block, on a named corpus whose digest is stored, it measured
 * these figures. Anyone can attest, every write emits an event, and nothing is ever silently
 * revised — the previous record stays in the log. A reader who trusts a figure here is trusting
 * the attester, and the contract makes that dependency explicit rather than hiding it behind the
 * word "oracle".
 *
 * WHAT IT REFUSES
 *
 * It refuses to store a rate for a hook that has no measurement behind it. `nMeasured == 0`
 * reverts. This is the on-chain form of the rule the whole project is built on: a read that did
 * not happen is never a zero. A hook nobody measured must be ABSENT here, not present with a
 * comfortable 0.
 *
 * It refuses an attestation whose corpus digest is empty, and one whose stub hash is empty:
 * without them the figure cannot be replayed, and a figure that cannot be replayed is an opinion.
 *
 * @dev Basis points are stored scaled by 10_000 (so 1 bps == 10_000 units). The engine reports
 *      four decimals — 99.9942 bps — and rounding that to an integer would lose the precision the
 *      concordance work depends on.
 */
contract HookRateAttestations {
    uint256 public constant BPS_SCALE = 10_000;

    struct Attestation {
        /// the hook whose take was measured
        address hook;
        /// the chain the measurement was taken on (8453 for Base), not the chain this contract is on
        uint32 measuredChainId;
        /// the block the fork was pinned to
        uint64 blockNumber;
        /// median of the MEASURED rows, scaled by BPS_SCALE
        uint64 medianBpsScaled;
        /// largest MEASURED row, scaled by BPS_SCALE
        uint64 maxBpsScaled;
        /// how many rows carry the label MEASURED. Zero is refused.
        uint32 nMeasured;
        /// how many rows were attempted but produced no value (NOT_QUOTABLE + NOT_MEASURABLE)
        uint32 nUnmeasurable;
        /// distinct pools behind the figures
        uint32 nPools;
        /// sha256 of the corpus file the figures were computed from
        bytes32 corpusDigest;
        /// keccak of the inert stub used for the counterfactual — pins the method, not just the result
        bytes32 stubHash;
        /// who said it
        address attester;
        /// when they said it, by block timestamp
        uint64 attestedAt;
        /// the engine that produced it, e.g. "tare-engine/0.3.0"
        string engineVersion;
    }

    /// hook => attester => the latest record. Earlier records stay in the event log.
    mapping(address => mapping(address => Attestation)) private _latest;
    /// every attester who has ever written about this hook, in order of first write
    mapping(address => address[]) private _attesters;
    mapping(address => mapping(address => bool)) private _known;
    /// every hook ever attested, in order of first attestation
    address[] private _hooks;
    mapping(address => bool) private _seen;

    event Attested(
        address indexed hook,
        address indexed attester,
        uint32 measuredChainId,
        uint64 blockNumber,
        uint64 medianBpsScaled,
        uint64 maxBpsScaled,
        uint32 nMeasured,
        uint32 nUnmeasurable,
        uint32 nPools,
        bytes32 corpusDigest,
        bytes32 stubHash,
        string engineVersion
    );

    error NoMeasurement(address hook);
    error NoCorpusDigest(address hook);
    error NoStubHash(address hook);
    error MedianAboveMax(uint64 median, uint64 max);
    error NothingAttested(address hook, address attester);

    /**
     * @notice Record what you measured. Anyone may call this; the record is yours, under your
     *         address, and it does not overwrite anyone else's.
     * @dev Reverts rather than storing a figure nothing supports. The three requirements are the
     *      contract's whole honesty surface: a measurement behind the number, a corpus behind the
     *      measurement, and a method behind the corpus.
     */
    function attest(
        address hook,
        uint32 measuredChainId,
        uint64 blockNumber,
        uint64 medianBpsScaled,
        uint64 maxBpsScaled,
        uint32 nMeasured,
        uint32 nUnmeasurable,
        uint32 nPools,
        bytes32 corpusDigest,
        bytes32 stubHash,
        string calldata engineVersion
    ) external {
        // A hook nobody measured is ABSENT from this contract, never present at zero.
        if (nMeasured == 0) revert NoMeasurement(hook);
        if (corpusDigest == bytes32(0)) revert NoCorpusDigest(hook);
        if (stubHash == bytes32(0)) revert NoStubHash(hook);
        // A median above the maximum would mean the two came from different sets.
        if (medianBpsScaled > maxBpsScaled) revert MedianAboveMax(medianBpsScaled, maxBpsScaled);

        _latest[hook][msg.sender] = Attestation({
            hook: hook,
            measuredChainId: measuredChainId,
            blockNumber: blockNumber,
            medianBpsScaled: medianBpsScaled,
            maxBpsScaled: maxBpsScaled,
            nMeasured: nMeasured,
            nUnmeasurable: nUnmeasurable,
            nPools: nPools,
            corpusDigest: corpusDigest,
            stubHash: stubHash,
            attester: msg.sender,
            attestedAt: uint64(block.timestamp),
            engineVersion: engineVersion
        });

        if (!_known[hook][msg.sender]) {
            _known[hook][msg.sender] = true;
            _attesters[hook].push(msg.sender);
        }
        if (!_seen[hook]) {
            _seen[hook] = true;
            _hooks.push(hook);
        }

        emit Attested(
            hook,
            msg.sender,
            measuredChainId,
            blockNumber,
            medianBpsScaled,
            maxBpsScaled,
            nMeasured,
            nUnmeasurable,
            nPools,
            corpusDigest,
            stubHash,
            engineVersion
        );
    }

    /**
     * @notice What one attester says about one hook.
     * @dev Reverts when there is nothing. It does NOT return a zero-filled struct: a caller who
     *      reads a struct of zeros cannot tell "measured zero" from "never measured", and that
     *      confusion is the exact failure this project exists to prevent.
     */
    function latest(address hook, address attester) external view returns (Attestation memory) {
        Attestation memory a = _latest[hook][attester];
        if (a.nMeasured == 0) revert NothingAttested(hook, attester);
        return a;
    }

    /// @notice True when this attester has said anything about this hook. Cheap, and never reverts.
    function hasAttestation(address hook, address attester) external view returns (bool) {
        return _latest[hook][attester].nMeasured != 0;
    }

    /// @notice Everyone who has attested about this hook, oldest first.
    function attestersOf(address hook) external view returns (address[] memory) {
        return _attesters[hook];
    }

    /// @notice Every hook this contract has ever heard about, oldest first.
    function hooks() external view returns (address[] memory) {
        return _hooks;
    }

    function hookCount() external view returns (uint256) {
        return _hooks.length;
    }
}

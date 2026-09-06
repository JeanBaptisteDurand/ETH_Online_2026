// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPairedTokenRegistry {
    error PairedTokenZeroAddress();
    error InvalidPairedTokenConfig();

    /// Thrown when a non-native paired token is configured without a price calculator
    error MissingPriceCalculator();

    /// Thrown when a price calculator's own `pairedToken()` binding disagrees with the token it
    /// is being registered for (or the calculator does not expose the getter at all)
    error PriceCalculatorTokenMismatch();

    /// Thrown when a price calculator cannot serve a live quote at registration time
    error PriceCalculatorNotLive();

    /// Thrown when a token's `feeEscrow` has not been pointed back at this registry — i.e. it is
    /// not a current-generation, registry-bound multi-token {FeeEscrow}
    error FeeEscrowRegistryMismatch();

    /// Thrown when a sub-18-decimal paired token is approved without explicit distribution
    /// thresholds (leaving them at 0 would inherit the 18-decimal native-token defaults)
    error MissingDistributionThresholds();

    /// Thrown when an ERC20 wrapper's declared `underlying` disagrees with the wrapper's own
    /// `underlying()` getter
    error PairedTokenUnderlyingMismatch();

    /// Thrown when a token's declared `decimals` disagrees with its own `decimals()` getter
    error PairedTokenDecimalsMismatch();

    /// Emitted when a paired token is approved (or its config is updated)
    event PairedTokenApproved(address indexed _token, PairedToken _config);

    /// Emitted when a paired token is removed from the whitelist
    event PairedTokenUnapproved(address indexed _token);

    /// Emitted when a paired token's price calculator is updated
    event PriceCalculatorUpdated(address indexed _token, address _priceCalculator);

    /**
     * The shape of a paired token, which determines how the protocol moves and settles it.
     *
     * @member Unset The zero value — an unregistered / zero-config token. Deliberately 0 so a
     * `tokenConfig` miss never matches a wrapper branch (e.g. a memecoin referral fee forwarded as-is).
     * @member NativeWrapper An ERC20 that wraps native ETH (flETH, and canonical WETH itself);
     * `withdraw` returns raw ETH. Prices 1:1 with ETH, so the registry gates it to 18 decimals
     * and it may not bind a price calculator — this is the shape WETH registers under.
     * @member Erc20Wrapper An ERC20 that wraps another ERC20 (e.g. flUSDC); `withdraw` returns `underlying`.
     * @member NativeEth Raw native ETH (`address(0)`, the Uniswap v4 native currency); paid/received
     * directly with no wrapper and no underlying.
     * @member Erc20 A plain ERC20 with no wrapper semantics (USDC, DOGE, ...); transferred as-is,
     * never unwrapped, priced through a MANDATORY calculator — which is why WETH does not belong
     * here (a WETH:WETH oracle pool cannot exist; register it as {NativeWrapper} instead).
     * Appended so the existing type values are unchanged.
     */
    enum PairedTokenType {
        Unset,
        NativeWrapper,
        Erc20Wrapper,
        NativeEth,
        Erc20
    }

    /**
     * Per-token configuration for an approved paired token.
     *
     * @member approved Whether the token is whitelisted as a paired token
     * @member tokenType The shape of the token (see {PairedTokenType}); determines wrap/unwrap and
     * native-vs-ERC20 settlement
     * @member decimals The decimals of the paired token, used to scale launch price + thresholds
     * @member underlying The ERC20 unwrapped from the wrapper (USDC for flUSDC); `address(0)` for
     * native wrappers and native ETH
     * @member feeEscrow The {FeeEscrow} that holds this token's escrowed fees. The escrow is
     * multi-token, so every registration normally points at the same singleton instance; the
     * field stays per-token so the hooks' launch-time snapshots keep working across generations
     * @member priceCalculator The {IPairedTokenPriceCalculator} that converts ETH amounts into
     * this token's units for launch pricing. Required for `Erc20` / `Erc20Wrapper` tokens; must
     * be zero for `NativeEth` / `NativeWrapper` tokens (they are 1:1 with ETH by definition, so
     * there is exactly one pricing path per shape)
     * @member minDistribute The minimum fee inventory before a pool distributes, in token units
     * @member bidWallThreshold The accumulated-fee threshold before the BidWall repositions, in token units
     */
    struct PairedToken {
        bool approved;
        PairedTokenType tokenType;
        uint8 decimals;
        address underlying;
        address feeEscrow;
        address priceCalculator;
        uint minDistribute;
        uint bidWallThreshold;
    }

    function isApproved(
        address _token
    ) external view returns (bool);

    function tokenConfig(
        address _token
    ) external view returns (PairedToken memory);

    function approvePairedToken(
        address _token,
        PairedToken calldata _config
    ) external;

    function unapprovePairedToken(
        address _token
    ) external;

    function setPriceCalculator(
        address _token,
        address _priceCalculator
    ) external;
}

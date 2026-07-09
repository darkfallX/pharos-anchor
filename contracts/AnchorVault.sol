// SPDX-License-Identifier: MIT-0
pragma solidity ^0.8.24;

interface IAnchorUSD {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function mint(address to, uint256 amount) external;
}

/// @title AnchorVault
/// @notice Demo RWA-yield vault for the Anchor savings agent on Pharos Atlantic
///         testnet. Deposits accrue a fixed APY mirroring the pAlpha RealFi vault
///         (~12.9% net). Yield is minted from the aUSD faucet at withdrawal, so
///         this is a testnet stand-in, not production.
contract AnchorVault {
    struct Position {
        uint256 principal;
        uint256 accrued;
        uint64 lastUpdate;
    }

    IAnchorUSD public immutable usd;
    address public owner;
    uint256 public apyBps; // 1290 = 12.9%
    uint256 public totalPrincipal;

    uint256 private constant YEAR = 365 days;
    uint256 private constant BPS = 10000;

    mapping(address => Position) private positions;

    event Deposited(address indexed user, uint256 amount, uint256 principal);
    event Withdrawn(address indexed user, uint256 amount, uint256 principal);
    event RateChanged(uint256 apyBps);

    error NotOwner();
    error Zero();
    error Insufficient();

    constructor(address usdToken, uint256 initialApyBps) {
        usd = IAnchorUSD(usdToken);
        owner = msg.sender;
        apyBps = initialApyBps;
    }

    /// @notice Yield accrued since the position was last touched, not yet booked.
    function _pending(Position memory p) private view returns (uint256) {
        if (p.principal == 0 || p.lastUpdate == 0) return 0;
        uint256 elapsed = block.timestamp - p.lastUpdate;
        return (p.principal * apyBps * elapsed) / (BPS * YEAR);
    }

    function _accrue(address user) private {
        Position storage p = positions[user];
        uint256 pending = _pending(p);
        if (pending > 0) p.accrued += pending;
        p.lastUpdate = uint64(block.timestamp);
    }

    /// @notice Put money into savings. Caller must approve this vault first.
    function deposit(uint256 amount) external {
        if (amount == 0) revert Zero();
        _accrue(msg.sender);
        usd.transferFrom(msg.sender, address(this), amount);
        Position storage p = positions[msg.sender];
        p.principal += amount;
        totalPrincipal += amount;
        emit Deposited(msg.sender, amount, p.principal);
    }

    /// @notice Take money out. Draws from earned yield first, then principal.
    function withdraw(uint256 amount) public {
        if (amount == 0) revert Zero();
        _accrue(msg.sender);
        Position storage p = positions[msg.sender];
        uint256 total = p.principal + p.accrued;
        if (amount > total) revert Insufficient();

        uint256 fromAccrued = amount > p.accrued ? p.accrued : amount;
        p.accrued -= fromAccrued;
        uint256 fromPrincipal = amount - fromAccrued;
        if (fromPrincipal > 0) {
            p.principal -= fromPrincipal;
            totalPrincipal -= fromPrincipal;
        }

        // The yield portion has no backing on testnet, mint it from the faucet.
        uint256 bal = usd.balanceOf(address(this));
        if (bal < amount) usd.mint(address(this), amount - bal);
        usd.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, p.principal);
    }

    /// @notice Take everything, principal plus all earned yield.
    function withdrawAll() external {
        _accrue(msg.sender);
        Position storage p = positions[msg.sender];
        withdraw(p.principal + p.accrued);
    }

    /// @notice Current savings position, with yield projected to now.
    function position(address user)
        external
        view
        returns (uint256 principal, uint256 earned, uint256 currentApyBps, uint64 lastUpdate)
    {
        Position memory p = positions[user];
        return (p.principal, p.accrued + _pending(p), apyBps, p.lastUpdate);
    }

    function setApyBps(uint256 newApyBps) external {
        if (msg.sender != owner) revert NotOwner();
        apyBps = newApyBps;
        emit RateChanged(newApyBps);
    }
}

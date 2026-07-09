// SPDX-License-Identifier: MIT-0
pragma solidity ^0.8.24;

interface IAnchorUSD {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function mint(address to, uint256 amount) external;
}

/// @title AnchorAgentVault
/// @notice Per-agent savings positions keyed by a bytes32 id. Agents park idle
///         aUSD to accrue the demo yield and recall on demand. On testnet the
///         yield is minted from the aUSD faucet at recall, mirroring the pAlpha rate.
contract AnchorAgentVault {
    struct Position {
        uint256 principal;
        uint256 accrued;
        uint64 lastUpdate;
    }

    IAnchorUSD public immutable usd;
    address public owner;
    uint256 public apyBps; // 1290 = 12.9%
    uint256 public totalPrincipal;
    uint256 public agentCount;

    uint256 private constant YEAR = 365 days;
    uint256 private constant BPS = 10000;

    mapping(bytes32 => Position) private positions;

    event Parked(bytes32 indexed agentId, uint256 amount, uint256 principal);
    event Recalled(bytes32 indexed agentId, uint256 amount, uint256 principal);
    event RateChanged(uint256 apyBps);

    error NotOwner();
    error Zero();
    error Insufficient();

    constructor(address usdToken, uint256 initialApyBps) {
        usd = IAnchorUSD(usdToken);
        owner = msg.sender;
        apyBps = initialApyBps;
    }

    function _pending(Position memory p) private view returns (uint256) {
        if (p.principal == 0 || p.lastUpdate == 0) return 0;
        return (p.principal * apyBps * (block.timestamp - p.lastUpdate)) / (BPS * YEAR);
    }

    function _accrue(bytes32 agentId) private {
        Position storage p = positions[agentId];
        uint256 pending = _pending(p);
        if (pending > 0) p.accrued += pending;
        p.lastUpdate = uint64(block.timestamp);
    }

    /// @notice Park idle funds for an agent. Caller must approve this vault.
    ///         Open to anyone: parking only ever adds to an agent's position.
    function park(bytes32 agentId, uint256 amount) external {
        if (amount == 0) revert Zero();
        _accrue(agentId);
        usd.transferFrom(msg.sender, address(this), amount);
        Position storage p = positions[agentId];
        if (p.principal == 0 && p.accrued == 0) agentCount += 1;
        p.principal += amount;
        totalPrincipal += amount;
        emit Parked(agentId, amount, p.principal);
    }

    /// @notice Recall funds for an agent. Owner-gated: the Anchor service is the
    ///         custody gate on testnet so one agent cannot drain another's id.
    function recall(bytes32 agentId, uint256 amount, address to) public {
        if (msg.sender != owner) revert NotOwner();
        if (amount == 0) revert Zero();
        _accrue(agentId);
        Position storage p = positions[agentId];
        uint256 total = p.principal + p.accrued;
        if (amount > total) revert Insufficient();

        uint256 fromAccrued = amount > p.accrued ? p.accrued : amount;
        p.accrued -= fromAccrued;
        uint256 fromPrincipal = amount - fromAccrued;
        if (fromPrincipal > 0) {
            p.principal -= fromPrincipal;
            totalPrincipal -= fromPrincipal;
        }

        // yield has no backing on testnet, mint the shortfall from the faucet
        uint256 bal = usd.balanceOf(address(this));
        if (bal < amount) usd.mint(address(this), amount - bal);
        usd.transfer(to, amount);
        emit Recalled(agentId, amount, p.principal);
    }

    /// @notice Recall everything an agent has, principal plus earned yield.
    function recallAll(bytes32 agentId, address to) external {
        if (msg.sender != owner) revert NotOwner();
        _accrue(agentId);
        Position storage p = positions[agentId];
        recall(agentId, p.principal + p.accrued, to);
    }

    /// @notice Anyone can verify any agent's position, live.
    function positionOf(bytes32 agentId)
        external
        view
        returns (uint256 principal, uint256 earned, uint256 currentApyBps, uint64 lastUpdate)
    {
        Position memory p = positions[agentId];
        return (p.principal, p.accrued + _pending(p), apyBps, p.lastUpdate);
    }

    function setApyBps(uint256 newApyBps) external {
        if (msg.sender != owner) revert NotOwner();
        apyBps = newApyBps;
        emit RateChanged(newApyBps);
    }
}

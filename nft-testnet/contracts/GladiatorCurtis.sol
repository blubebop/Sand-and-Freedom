// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @notice Disposable Curtis prototype. Not a production game authority or USD oracle.
/// @dev All metadata is stored on chain, so terminal records cannot be edited elsewhere.
contract GladiatorCurtis is ERC721, Ownable2Step, ReentrancyGuard {
    enum Life { Active, Memorial, Victorious }
    uint256 public constant TEST_MINT_PRICE = 0.25 ether;
    uint256 public nextTokenId = 1;
    address payable public immutable treasury;
    mapping(uint256 => Life) public life;
    mapping(uint256 => uint256) public revision;
    mapping(uint256 => bytes32) public saveHash;
    mapping(uint256 => string) private metadata;
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
    event MetadataUpdate(uint256 _tokenId);
    event CampaignFinalized(uint256 indexed tokenId, Life outcome, bytes32 saveHash);
    event Checkpoint(uint256 indexed tokenId, uint256 revision, bytes32 saveHash);
    error CurtisOnly();
    error WrongPayment();
    error TransferLocked();
    error AlreadyFinal();
    error InvalidOutcome();
    error InvalidRecord();
    error StaleRevision();

    constructor(address admin, address payable recipient)
        ERC721("Sand & Freedom - CURTIS TEST", "SFTEST") Ownable(admin) {
        if (block.chainid != 33111) revert CurtisOnly();
        require(recipient != address(0), "Invalid treasury");
        treasury = recipient;
    }

    function mint() external payable nonReentrant returns (uint256 id) {
        if (msg.value != TEST_MINT_PRICE) revert WrongPayment();
        id = nextTokenId++;
        metadata[id] = '{"name":"Untrained Gladiator - TEST","description":"Curtis testnet prototype. Active and transfer locked.","attributes":[{"trait_type":"Status","value":"Active"}]}';
        _safeMint(msg.sender, id);
        emit Locked(id);
    }

    /// @dev Admin explicitly simulates validated server checkpoints in this prototype.
    function checkpoint(uint256 id, uint256 expectedRevision, bytes32 digest, string calldata json)
        external onlyOwner {
        _active(id, expectedRevision);
        _record(id, digest, json);
    }

    function finalize(uint256 id, uint256 expectedRevision, Life outcome, bytes32 digest, string calldata json)
        external onlyOwner {
        _active(id, expectedRevision);
        if (outcome == Life.Active) revert InvalidOutcome();
        _record(id, digest, json);
        life[id] = outcome;
        if (outcome == Life.Victorious) emit Unlocked(id);
        emit CampaignFinalized(id, outcome, digest);
    }

    function _active(uint256 id, uint256 expectedRevision) private view {
        _requireOwned(id);
        if (life[id] != Life.Active) revert AlreadyFinal();
        if (revision[id] != expectedRevision) revert StaleRevision();
    }

    function _record(uint256 id, bytes32 digest, string calldata json) private {
        // Small on-chain test records; the trusted authority is responsible for JSON semantics.
        if (digest == bytes32(0) || bytes(json).length < 2 || bytes(json).length > 8192) revert InvalidRecord();
        metadata[id] = json;
        saveHash[id] = digest;
        revision[id]++;
        emit Checkpoint(id, revision[id], digest);
        emit MetadataUpdate(id);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return string.concat("data:application/json;base64,", Base64.encode(bytes(metadata[id])));
    }

    function locked(uint256 id) external view returns (bool) {
        _requireOwned(id);
        return life[id] != Life.Victorious;
    }

    function _update(address to, uint256 id, address auth) internal override returns (address) {
        if (_ownerOf(id) != address(0) && life[id] != Life.Victorious) revert TransferLocked();
        return super._update(to, id, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || interfaceId == 0x49064906 || super.supportsInterface(interfaceId);
    }

    function withdraw() external nonReentrant {
        (bool ok,) = treasury.call{value: address(this).balance}("");
        require(ok, "Payment failed");
    }
}

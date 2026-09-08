const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  distributorRoom,
  normalizeEntityId,
  buildOrderUpdatePayload,
} = require("../src/socket");

test("normalizes ObjectIds and populated distributor documents to their ids", () => {
  const distributorId = new mongoose.Types.ObjectId();
  const UserProbe = mongoose.models.SocketIdentityProbe || mongoose.model(
    "SocketIdentityProbe",
    new mongoose.Schema({ name: String })
  );
  const populatedUser = new UserProbe({ _id: distributorId, name: "Distributor" });

  assert.equal(normalizeEntityId(distributorId), distributorId.toString());
  assert.equal(normalizeEntityId(populatedUser), distributorId.toString());
  assert.equal(normalizeEntityId({ _id: distributorId }), distributorId.toString());
  assert.equal(normalizeEntityId({ id: distributorId.toString() }), distributorId.toString());
  assert.equal(normalizeEntityId({ name: "missing id" }), null);
});

test("builds a stable order update payload for populated and unpopulated owners", () => {
  const orderId = new mongoose.Types.ObjectId();
  const distributorId = new mongoose.Types.ObjectId();
  const payload = buildOrderUpdatePayload({
    _id: orderId,
    status: "BOOKED",
    distributorId: { _id: distributorId, name: "Distributor" },
  });

  assert.deepEqual(payload, {
    orderId: orderId.toString(),
    status: "BOOKED",
    distributorId: distributorId.toString(),
  });
  assert.equal(distributorRoom(payload.distributorId), `room:dist:${distributorId}`);
});

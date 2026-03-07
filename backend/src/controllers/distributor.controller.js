const distributorService = require("../services/distributor.service");
const { created, ok, fail } = require("../utils/apiResponse");

exports.createDistributor = async (req, res, next) => {
  try {
    const distributor = await distributorService.createDistributor(req.body);
    return created(res, {
      message: "Distributor created successfully",
      data: distributor,
    });
  } catch (err) {
    next(err);
  }
};

exports.listDistributors = async (req, res, next) => {
  try {
    const data = await distributorService.listDistributors({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search || req.query.q,
      isActive: req.query.isActive,
    });

    return ok(res, {
      message: "Distributors fetched successfully",
      data: data.items,
      meta: data.meta,
    });
  } catch (err) {
    next(err);
  }
};

exports.getDistributorById = async (req, res, next) => {
  try {
    const distributor = await distributorService.getDistributorById(req.params.id);
    return ok(res, {
      message: "Distributor fetched successfully",
      data: distributor,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateDistributor = async (req, res, next) => {
  try {
    const distributor = await distributorService.updateDistributor(req.params.id, req.body);
    return ok(res, {
      message: "Distributor updated successfully",
      data: distributor,
    });
  } catch (err) {
    next(err);
  }
};

exports.toggleDistributorStatus = async (req, res, next) => {
  try {
    const distributor = await distributorService.toggleDistributorStatus(req.params.id);
    return ok(res, {
      message: `Distributor ${distributor.isActive ? "activated" : "deactivated"} successfully`,
      data: distributor,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteDistributor = async (req, res, next) => {
  try {
    await distributorService.deleteDistributor(req.params.id);
    return ok(res, {
      message: "Distributor deleted successfully",
      data: null,
    });
  } catch (err) {
    next(err);
  }
};
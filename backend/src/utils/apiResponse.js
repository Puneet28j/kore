exports.ok = (res, { message = "OK", data = null, meta = null } = {}) => {
  return res.status(200).json({ success: true, message, data, meta });
};

exports.created = (res, { message = "Created", data = null } = {}) => {
  return res.status(201).json({ success: true, message, data });
};

exports.fail = (res, { status = 400, message = "Bad Request" } = {}) => {
  return res.status(status).json({ success: false, message });
};
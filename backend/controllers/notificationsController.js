const { listForUser } = require('../utils/notifications');

exports.mine = async (req, res) => {
  try {
    const list = await listForUser(req.user?.id);
    return res.json(list);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};


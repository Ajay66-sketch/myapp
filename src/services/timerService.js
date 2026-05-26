// src/services/timerService.js
// SRE-grade atomic distributed timer state management utilizing Redis Lua scripts

const getRedisClient = () => {
  try {
    return require('../socket').getRedisClient();
  } catch (err) {
    return null;
  }
};

/**
 * Perform atomic State transition in Redis via Lua Script
 */
async function atomicTransition(roomId, action, payload = {}) {
  const redisClient = getRedisClient();
  const key = `timer:room:${roomId}`;
  const now = Date.now();

  if (!redisClient || redisClient.status !== 'ready') {
    // Failback: Return null to trigger in-memory local state fallback updates
    return null;
  }

  // SRE-grade Redis Lua transitions scripts
  const luaScript = `
    local key = KEYS[1]
    local action = ARGV[1]
    local now = tonumber(ARGV[2])
    local duration = tonumber(ARGV[3])

    local stateStr = redis.call("get", key)
    local state = {}
    if stateStr then
      state = cjson.decode(stateStr)
    else
      state = { state = "idle", duration = 0, endTime = 0, startSent = false, midSent = false, completeSent = false, lastMotivationalMin = nil }
    end

    if action == "start" then
      state.state = "running"
      state.duration = duration
      state.endTime = now + (duration * 1000)
      state.startSent = true
      state.midSent = false
      state.completeSent = false
      state.lastMotivationalMin = nil
      redis.call("set", key, cjson.encode(state), "EX", duration + 10)
      return cjson.encode(state)
    
    elseif action == "pause" then
      if state.state == "running" then
        state.state = "paused"
        local remaining = math.max(0, math.ceil((state.endTime - now) / 1000))
        state.remainingTime = remaining
        redis.call("set", key, cjson.encode(state), "EX", 86400)
        return cjson.encode(state)
      end
    
    elseif action == "resume" then
      if state.state == "paused" then
        state.state = "running"
        local remaining = tonumber(state.remainingTime or 0)
        state.endTime = now + (remaining * 1000)
        redis.call("set", key, cjson.encode(state), "EX", remaining + 10)
        return cjson.encode(state)
      end
    
    elseif action == "cancel" then
      state.state = "idle"
      state.remainingTime = state.duration
      state.startSent = false
      state.midSent = false
      state.completeSent = false
      state.lastMotivationalMin = nil
      redis.call("del", key)
      return cjson.encode(state)
    end

    return nil
  `;

  try {
    const result = await redisClient.eval(
      luaScript,
      1,
      key,
      action,
      now,
      payload.duration || 0
    );
    return result ? JSON.parse(result) : null;
  } catch (err) {
    console.warn(`[TimerService] Lua evaluation failed on key ${key}, falling back to memory`, err.message);
    return null;
  }
}

module.exports = {
  atomicTransition,
};

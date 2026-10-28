/* TILE RUSH — account, session and leaderboard client. */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var base = (params.get('api') || '').replace(/\/$/, '');
  var listeners = [];
  var state = { user: null, ready: false };
  var readyResolve;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(state.user); } catch (e) { /* ignore listener errors */ }
    });
  }

  function request(path, options) {
    var opts = options || {};
    var init = {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: {}
    };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(base + path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Request failed.');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function setUser(user) {
    state.user = user || null;
    state.ready = true;
    emit();
  }

  var Account = {
    init: function () {
      function load(attempt) {
        return request('/api/auth/me')
          .then(function (data) { setUser(data.user); })
          .catch(function () {
            if (attempt < 2) {
              return new Promise(function (resolve) { setTimeout(resolve, 700); })
                .then(function () { return load(attempt + 1); });
            }
            setUser(null);
          });
      }
      load(0).then(function () { readyResolve(state.user); });
      return readyPromise;
    },
    ready: function () { return readyPromise; },
    user: function () { return state.user; },
    onChange: function (fn) {
      listeners.push(fn);
      if (state.ready) fn(state.user);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    register: function (username, password) {
      return request('/api/auth/register', { method: 'POST', body: { username: username, password: password } })
        .then(function (data) { setUser(data.user); return data.user; });
    },
    login: function (username, password) {
      return request('/api/auth/login', { method: 'POST', body: { username: username, password: password } })
        .then(function (data) { setUser(data.user); return data.user; });
    },
    logout: function () {
      return request('/api/auth/logout', { method: 'POST', body: {} })
        .then(function () { setUser(null); });
    },
    refresh: function () {
      return request('/api/auth/me').then(function (data) { setUser(data.user); return data.user; });
    },
    submitRun: function (run) {
      return request('/api/runs', {
        method: 'POST',
        body: {
          score: run.score,
          tier: run.tier,
          accuracy: run.accuracy,
          avgRt: run.avgRt
        }
      }).then(function (data) {
        if (data.user) setUser(data.user);
        return data;
      });
    },
    leaderboard: function (by, limit) {
      return request('/api/leaderboard?by=' + encodeURIComponent(by || 'score') + '&limit=' + (limit || 50));
    }
  };

  window.Account = Account;
})();

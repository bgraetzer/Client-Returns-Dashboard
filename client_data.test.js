// client_data.test.js
// Tests for client_data.js (structure and sample data)

const assert = require('assert');
const clientData = require('./client_data.json');

describe('Client Data', function() {
    it('should have clients property', function() {
        assert(clientData.hasOwnProperty('clients'));
        assert(typeof clientData.clients === 'object');
    });
    it('should have dates property', function() {
        assert(Array.isArray(clientData.dates));
        assert(clientData.dates.length > 0);
    });
    it('should have at least one client', function() {
        assert(Object.keys(clientData.clients).length > 0);
    });
    it('each client should have actual and benchmark arrays', function() {
        for (const client of Object.values(clientData.clients)) {
            assert(Array.isArray(client.actual));
            assert(Array.isArray(client.benchmark));
            assert.strictEqual(client.actual.length, clientData.dates.length);
            assert.strictEqual(client.benchmark.length, clientData.dates.length);
        }
    });
    it('should end at 31 March 2026', function() {
        assert.strictEqual(clientData.dates[clientData.dates.length - 1], '2026-03-31 00:00:00');
    });
});

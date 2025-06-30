import { _ } from 'meteor/underscore';
import CountSubscription from './counts/countSubscription';
import createGraph from './lib/createGraph.js';
import recursiveFetch from './lib/recursiveFetch.js';
import prepareForProcess from './lib/prepareForProcess.js';
import Base from './query.base';
import { Tracker } from 'meteor/tracker';

export default class Query extends Base {

  cache = {};

  /**
   * Subscribe
   *
   * @param callback {Function} optional
   * @returns {null|any|*}
   */
  subscribe(callback) {
    this.doValidateParams();


    const query = this;

    this.subscriptionHandle = Meteor.subscribe(
      this.name,
      prepareForProcess(this.body, this.params),
      {
        onReady(res) {
          if (callback) {
            if (typeof callback === 'function') {x
              callback(res);
            } else if (typeof callback === 'object') {
              callback.onReady?.(res);
            }
          }

          //  Run this here after all collections are ready.
          // cache the result
          Tracker.autorun(async (computation) => {
            const results = await Tracker.withComputation(computation, () => query._fetchReactive());
            query.cache[query.subscriptionHandle.subscriptionId] = results;
          });

        },
        onStop(err) {
          if (callback && typeof callback === 'object') {
            callback.onStop?.(err);
          }
        }
      },
    );

    return this.subscriptionHandle;
  }

  /**
   * Subscribe to the counts for this query
   *
   * @param callback
   * @returns {Object}
   */
  subscribeCount(callback) {
    this.doValidateParams();

    if (!this._counter) {
      this._counter = new CountSubscription(this);
    }

    return this._counter.subscribe(
      prepareForProcess(this.body, this.params),
      callback,
    );
  }

  /**
   * Unsubscribe if an existing subscription exists
   */
  unsubscribe() {
    if (this.subscriptionHandle) {
      this.cache[this.subscriptionHandle.subscriptionId] = null;
      this.subscriptionHandle.stop();
    }

    this.subscriptionHandle = null;
  }

  /**
   * Unsubscribe to the counts if a subscription exists.
   */
  unsubscribeCount() {
    if (this._counter) {
      this._counter.unsubscribe();
      this._counter = null;
    }
  }

  /**
   * @deprecated Use fetchAsync
   */
  fetchSync() {
    return this.fetchAsync();
  }

  /**
   * Fetches elements in sync using promises
   * @return {*}
   */
  async fetchAsync() {
    if (this.subscriptionHandle) {
      throw new Meteor.Error(
        'This query is reactive, meaning you cannot use promises to fetch the data.',
      );
    }

    this.doValidateParams();
    return Meteor.callAsync(
      this.name,
      prepareForProcess(this.body, this.params),
    );
  }

  /**
   * @deprecated Use fetchOneAsync
   */
  async fetchOneSync() {
    return this.fetchOneAsync();
  }

  /**
   * Fetches one element in sync
   * @return {Promise<unknown>}
   */
  async fetchOneAsync() {
    return _.first(await this.fetchAsync());
  }

  /**
   * Retrieves the data.
   * @param callbackOrOptions
   * @returns {*}
   */
  fetch(callbackOrOptions) {
    this.doValidateParams();

    if (!this.subscriptionHandle) {
      this._fetchStatic().then(
        (res) => {
          callbackOrOptions(undefined, res);
        },
        (err) => {
          callbackOrOptions(err, undefined);
        },
      );
    } else {
        // Use cache instead of async _fetchReactive
        return this.cache[this.subscriptionHandle.subscriptionId];
        // return this._fetchReactive(callbackOrOptions);
    }
  }

  /**
   * @param args
   * @returns {*}
   */
  fetchOne(...args) {
    if (!this.subscriptionHandle) {
      const callback = args[0];
      if (!_.isFunction(callback)) {
        throw new Meteor.Error('You did not provide a valid callback');
      }

      this.fetch((err, res) => {
        callback(err, res ? _.first(res) : null);
      });
    } else {
      return _.first(this.fetch(...args));
    }
  }

  /**
   * @deprecated Use getCountAsync
   *
   */
  async getCountSync() {
    return this.getCountAsync();
  }

  /**
   * Gets the count of matching elements in sync.
   * @returns {Promise<number>}
   */
  async getCountAsync() {
    if (this._counter) {
      throw new Meteor.Error(
        'This query is reactive, meaning you cannot use promises to fetch the data.',
      );
    }

    return Meteor.callAsync(
      this.name + '.count',
      prepareForProcess(this.body, this.params),
    );
  }

  /**
   * Gets the count of matching elements.
   * @param callback
   * @returns {any}
   */
  getCount(callback) {
    if (this._counter) {
      return this._counter.getCount();
    } else {
      if (!callback) {
        throw new Meteor.Error(
          'not-allowed',
          'You are on client so you must either provide a callback to get the count or subscribe first.',
        );
      } else {
        return Meteor.call(
          this.name + '.count',
          prepareForProcess(this.body, this.params),
          callback,
        );
      }
    }
  }

  _fetchStatic() {
    return Meteor.callAsync(
      this.name,
      prepareForProcess(this.body, this.params),
    );
  }

  /**
   * Fetching when we've got an active publication
   *
   * @param options
   * @returns {*}
   * @private
   */
  async _fetchReactive(options = {}) {
    let body = prepareForProcess(this.body, this.params);
    if (!options.allowSkip && body.$options && body.$options.skip) {
      delete body.$options.skip;
    }

    return await recursiveFetch(createGraph(this.collection, body), this.params);
  }
}

/*global it, xit, describe, beforeEach, afterEach, xdescribe */
/*jshint -W030 */ // Expected an assignment or function call and instead saw an expression

import Dataset from 'impagination/dataset';
import '../test-helper';

import Ember from 'ember';
import { it } from 'ember-mocha';
import { describe } from 'mocha';
import { expect } from 'chai';
import Server from 'ember-cli-mirage/server';
import Factory from 'ember-cli-mirage/factory';

describe("Dataset", function() {
  beforeEach(function () {
    // Create Ember-Cli Server and Factories
    this.server = new Server({environment: 'test'});
    server.loadFactories({
      record: Factory.extend({
        name(i) { return `Record ${i}`; }
      }),
      page: Factory.extend({
        name(i) { return `Page ${i}`; },
        records: []
      })
    });
  });
  afterEach(function() {
    this.server.shutdown();
  });

  it("exists", function() {
    expect(Dataset).to.be.instanceOf(Object);
  });

  xit('works with asynchronous tests using promises', function() {
    return new Ember.RSVP.Promise(function(resolve) {
      setTimeout(function() {
        expect(true).to.equal(true);
        resolve();
      }, 10);
    });
  });

  describe("instantiating a new dataset", function() {

    it("cannot be instantiated without pageSize", function() {
      var err = "";
      try { new Dataset(); } catch(e) { err = e; }
      expect(err).to.match(/without pageSize/);
    });

    it("cannot be instantiated without fetch()", function () {
      var err = "";
      try { new Dataset({pageSize: 1}); } catch(e) { err = e; }
      expect(err).to.match(/without fetch/);
    });

    describe("default constructor values", function() {
      beforeEach(function() {
        this.dataset = new Dataset({
          pageSize: 10,
          fetch: function(pageOffset){
            var data = {
              records: new Array(10).fill(pageOffset + 1)
            };
            return new Ember.RSVP.Promise((resolve) => {
              resolve(data);
            });
          }
        });
      });

      it("has default constructor values", function() {
        expect(this.dataset._fetch).to.be.instanceOf(Function);
        expect(this.dataset._observe).to.be.instanceOf(Function);
        expect(this.dataset._loadHorizon).to.equal(1);
        expect(this.dataset._unloadHorizon).to.equal(Infinity);
      });

      it("initializes the state", function() {
        expect(this.dataset.state).to.be.instanceOf(Object);
        expect(this.dataset.state.totalSize).to.equal(0);
      });
    });
  });

  describe("thenables", function () {
    beforeEach(function() {
      this.recordsPerPage = 10;
      this.resolvers = [];
      this.rejecters = [];

      this.options = {
        pageSize: this.recordsPerPage,
        fetch: (pageOffset, stats) => {
          return new Ember.RSVP.Promise((resolve, reject) => {
            this.resolvers.push({
              resolve: resolve,
              pageOffset: pageOffset,
              stats: stats
            });
            this.rejecters.push({
              reject: reject,
              pageOffset: pageOffset,
              stats: stats
            });
          });
        }
      };
      this.dataset = new Dataset(this.options);
    });

    it("captures the resolve", function() {
      var resolve = this.resolvers[0].resolve;
      expect(resolve.name).to.equal('resolvePromise');
    });

    it("captures the reject", function() {
      var resolve = this.rejecters[0].reject;
      expect(resolve.name).to.equal('rejectPromise');
    });

    describe("resolving a fetched page", function() {
      beforeEach(function() {
        var records = this.server.createList('record', this.recordsPerPage);
        this.resolvers.forEach(function(obj) {
          obj.resolve(records);
        });
      });
      it('loads a single page', function () {
        expect(this.dataset.state.pages.length).to.equal(1);
      });
      it('loads a single page of records', function () {
        var page = this.dataset.state.pages[0];
        expect(page.records.length).to.equal(this.recordsPerPage);
        expect(page.records[0].name).to.equal('Record 0');
      });
    });

    describe("rejecting a fetched page", function() {

      describe("with totalPages stats", function() {
        beforeEach(function() {
          this.rejecters.forEach(function(obj) {
            obj.stats.totalPages = 5;
            obj.reject();
          });
        });
        it("loads the totalPages", function() {
          expect(this.dataset.state.pages.length).to.equal(5);
        });
        it("marks the page as rejected", function() {
          var page = this.dataset.state.pages[0];
          expect(page.isRejected).to.be.true;
        });
      });

      describe("without totalPages stats", function() {
        beforeEach(function() {
          this.rejecters.forEach(function(obj) {
            obj.reject();
          });
        });
        it('loads a single page', function () {
          expect(this.dataset.state.pages.length).to.equal(1);
        });
        it("marks the page as rejected", function() {
          var page = this.dataset.state.pages[0];
          expect(page.isRejected).to.be.true;
        });
      });

      describe("with an error", function() {
        beforeEach(function() {
          this.rejecters.forEach(function(obj) {
            obj.reject("404");
          });
        });
        it("has an error message on the page", function() {
          var page = this.dataset.state.pages[0];
          expect(page.error).to.equal("404");
        });
      });

    });

  });

  describe("loading pages", function() {
    beforeEach(function() {
      this.totalPages = 5;
      this.recordsPerPage = 10;
      this.pages = [];

      for(var i = 0; i < this.totalPages; i+=1){
        var records = this.server.createList('record', this.recordsPerPage);
        this.pages.push( this.server.create('page', {records: records}) );
      }

      this.options = {
        pageSize: this.recordsPerPage,
        fetch: (pageOffset) => {
          var records = this.pages[pageOffset].records;
          return new Ember.RSVP.Promise((resolve) => {
            resolve(records);
          });
        }
      };
    });

    describe("setting the loadHorizon", function() {
      beforeEach(function() {
        this.options.loadHorizon = 2;
        this.dataset = new Dataset(this.options);
      });
      it("sets the loadHorizon", function () {
        expect(this.dataset._loadHorizon).to.equal(2);
      });
    });

    describe("setting the unloadHorizon", function() {
      beforeEach(function () {
        this.options.unloadHorizon = 3;
        this.dataset = new Dataset(this.options);
      });
      it("sets the unloadHorizon", function () {
        expect(this.dataset._unloadHorizon).to.equal(3);
      });
    });

    describe("start loading from the beginning", function() {
      describe("with a single page load horizon", function() {
        beforeEach(function() {
          this.options.loadHorizon = 1;
          this.dataset = new Dataset(this.options);
        });

        it('loads a single page', function () {
          expect(this.dataset.state.pages.length).to.equal(1);
        });

        it('loads a single page of records', function () {
          var page = this.dataset.state.pages[0];
          expect(page.records).to.be.instanceOf(Array);
          expect(page.records.length).to.equal(this.recordsPerPage);
          expect(page.records[0].name).to.equal('Record 0');
        });

        describe("loading the next page", function() {
          beforeEach(function() {
            this.dataset.setReadOffset(1);
          });
          it("loads an additional page", function() {
            expect(this.dataset.state.pages.length).to.equal(2);
          });
        });
      });
    });

    describe("start loading from the middle", function() {
      describe("with a single page load horizon", function() {
        beforeEach(function() {
          this.options.loadHorizon = 1;
          this.options.initialReadOffset = 2;
          this.dataset = new Dataset(this.options);
        });

        it('initializes all pages up to the loadHorizon', function () {
          expect(this.dataset.state.pages.length).to.equal(3);
        });

        it('loads page 0 as an unrequested page', function () {
          var unrequestedPage = this.dataset.state.pages[0];
          expect(unrequestedPage.isRequested).to.be.false;
        });

        it('loads two resolved pages', function () {
          var resolvedPages = this.dataset.state.pages.slice(1,3);
          expect(resolvedPages[0].isResolved).to.be.true;
          expect(resolvedPages[1].isResolved).to.be.true;
        });

        it("has an empty set of records on the first page", function() {
          var unrequestedPage = this.dataset.state.pages[0];
          expect(unrequestedPage.records.length).to.equal(10);
          expect(unrequestedPage.records[0]).to.be.empty;
        });

        it('loads a single page of records before the offset', function () {
          var beforeOffsetResolvedPages = this.dataset.state.pages[1];
          expect(beforeOffsetResolvedPages.records.length).to.equal(this.recordsPerPage);
          expect(beforeOffsetResolvedPages.records[0].name).to.equal('Record 10');
        });

        it('loads a single page of records after the offset', function () {
          var afterOffsetResolvedPages = this.dataset.state.pages[2];
          expect(afterOffsetResolvedPages.records.length).to.equal(this.recordsPerPage);
          expect(afterOffsetResolvedPages.records[0].name).to.equal('Record 20');
        });
      });

      describe("with a single page unload horizon", function() {
        beforeEach(function() {
          this.options.loadHorizon = 1;
          this.options.unloadHorizon = 2;
          this.options.initialReadOffset = 2;
          this.dataset = new Dataset(this.options);
        });

        it('initializes all pages up to the loadHorizon', function () {
          expect(this.dataset.state.pages.length).to.equal(3);
        });

        it("does not have data defined on the first page", function() {
          var unrequestedPage = this.dataset.state.pages[0];
          expect(unrequestedPage.records.length).to.equal(10);
          expect(unrequestedPage.records[0]).to.be.empty;
        });

        it('loads a single page of records before the offset', function () {
          var beforeOffsetResolvedPages = this.dataset.state.pages[1];
          expect(beforeOffsetResolvedPages.isRequested).to.be.true;
          expect(beforeOffsetResolvedPages.records[0].name).to.equal('Record 10');
        });

        it('loads a single page of records after the offset', function () {
          var afterOffsetResolvedPages = this.dataset.state.pages[2];
          expect(afterOffsetResolvedPages.isRequested).to.be.true;
          expect(afterOffsetResolvedPages.records[0].name).to.equal('Record 20');
        });

        describe("incrementing the readOffset", function() {
          beforeEach(function() {
            this.dataset.setReadOffset(4);
          });

          it('initializes all pages up to the loadHorizon', function () {
            expect(this.dataset.state.pages.length).to.equal(5);
          });

          it("unloads the page before the previous offset", function() {
            var unrequestedPage = this.dataset.state.pages[1];
            expect(unrequestedPage.isRequested).to.be.false;
          });

          it("does not unload the page before the current offset", function() {
            var loadedPage = this.dataset.state.pages[2];
            expect(loadedPage.isRequested).to.be.true;
          });

          it('loads a single page of records before the offset', function () {
            var beforeOffsetResolvedPages = this.dataset.state.pages[3];
            expect(beforeOffsetResolvedPages.isRequested).to.be.true;
            expect(beforeOffsetResolvedPages.records[0].name).to.equal('Record 30');
          });

          it('loads a single page of records after the offset', function () {
            var afterOffsetResolvedPages = this.dataset.state.pages[4];
            expect(afterOffsetResolvedPages.isRequested).to.be.true;
            expect(afterOffsetResolvedPages.records[0].name).to.equal('Record 40');
          });
        });
        describe("decrementing the readOffset", function() {
          beforeEach(function() {
            this.dataset.setReadOffset(0);
          });
          it("unloads the page after the previous offset", function() {
            var unrequestedPage = this.dataset.state.pages[2];
            expect(unrequestedPage.isRequested).to.be.false;
          });

          it("does not unload the page after the current offset", function() {
            var loadedPage = this.dataset.state.pages[1];
            expect(loadedPage.isRequested).to.be.true;
          });

          it('loads a single page of records before the offset', function () {
            var beforeOffsetResolvedPages = this.dataset.state.pages[0];
            expect(beforeOffsetResolvedPages.records.length).to.equal(this.recordsPerPage);
            expect(beforeOffsetResolvedPages.records[0].name).to.equal('Record 0');
          });

          it('loads a single page of records after the offset', function () {
            var afterOffsetResolvedPages = this.dataset.state.pages[1];
            expect(afterOffsetResolvedPages.records.length).to.equal(this.recordsPerPage);
            expect(afterOffsetResolvedPages.records[0].name).to.equal('Record 10');
          });
        });
      });

      describe("the end of total pages", function() {
        beforeEach(function() {
          this.options.fetch = (pageOffset, stats) => {
            var records,
                _this = this;
            if(pageOffset < _this.totalPages){
              records = this.pages[pageOffset].records;
            } else {
              stats.totalPages = _this.totalPages;
            }
            return new Ember.RSVP.Promise((resolve, reject) => {
              if(pageOffset < _this.totalPages){
                resolve(records);
              } else {
                reject();
              }
            });
          };
        });

        describe("setting the read head at the total page boundary", function() {
          beforeEach(function() {
            this.options.initialReadOffset = this.totalPages;
          });

          describe("with a single page load horizon", function() {
            beforeEach(function() {
              this.options.loadHorizon = 1;
              this.dataset = new Dataset(this.options);
            });

            it('initializes only pages up to the total number of pages', function () {
              expect(this.dataset.state.pages.length).to.equal(this.totalPages);
            });

            it('loads unrequested pages before the load Horizon', function () {
              var unrequestedPages = this.dataset.state.pages.slice(0, this.options.initialReadOffset - this.options.loadHorizon);
              unrequestedPages.forEach(function (unrequestedPage) {
                expect(unrequestedPage.isRequested).to.be.false;
              });
            });

            it('loads one resolved page within the loadHorizon', function () {
              var resolvedPages = this.dataset.state.pages.slice(this.options.initialReadOffset - this.options.loadHorizon, this.totalPages);
              resolvedPages.forEach(function (resolvedPage) {
                expect(resolvedPage.isResolved).to.be.true;
              });
            });
          });
        });

        describe("setting the read head one past the total page boundary", function() {
          beforeEach(function() {
            this.options.initialReadOffset = this.totalPages + 1;
          });

          describe("when reject() returns the total number of pages", function() {
            beforeEach(function() {
              this.options.fetch = (pageOffset, stats) => {
                var records,
                    _this = this;
                if(pageOffset < _this.totalPages){
                  records = this.pages[pageOffset].records;
                } else {
                  stats.totalPages = _this.totalPages;
                }
                return new Ember.RSVP.Promise((resolve, reject) => {
                  if(pageOffset < _this.totalPages){
                    resolve(records);
                  } else {
                    reject();
                  }
                });
              };
            });

            describe("with a single page load horizon", function() {
              beforeEach(function() {
                this.options.loadHorizon = 1;
                this.dataset = new Dataset(this.options);
              });

              it('initializes only pages up to the total number of pages', function () {
                expect(this.dataset.state.pages.length).to.equal(this.totalPages);
              });

              it('loads unrequested pages throughout the dataset', function () {
                var pages = this.dataset.state.pages;
                var unrequestedPages = this.dataset.state.pages.slice(0, pages.length);
                unrequestedPages.forEach(function (unrequestedPage) {
                  expect(unrequestedPage.isRequested).to.be.false;
                });
              });
            });
          });

          describe("when reject() does not return the total number of pages", function() {
            beforeEach(function() {
              this.options.fetch = (pageOffset) => {
                var records,
                    _this = this;
                if(pageOffset < _this.totalPages){
                  records = this.pages[pageOffset].records;
                }
                return new Ember.RSVP.Promise((resolve, reject) => {
                  if(pageOffset < _this.totalPages){
                    resolve(records);
                  } else {
                    reject();
                  }
                });
              };
            });

            describe("with a single page load horizon", function() {
              beforeEach(function() {
                this.options.loadHorizon = 1;
                this.dataset = new Dataset(this.options);
              });

              it('initializes pages up to and including the requested offset', function () {
                expect(this.dataset.state.pages.length).to.equal(this.options.initialReadOffset + this.options.loadHorizon);
              });

              it('loads unrequested pages before the load Horizon', function () {
                var unrequestedPages = this.dataset.state.pages.slice(0, this.options.initialReadOffset - this.options.loadHorizon);
                unrequestedPages.forEach(function (unrequestedPage) {
                  expect(unrequestedPage.isRequested).to.be.false;
                });
              });

              it('loads one resolved page within the loadHorizon', function () {
                var resolvedPages = this.dataset.state.pages.slice(this.options.initialReadOffset - this.options.loadHorizon, this.totalPages);
                resolvedPages.forEach(function (resolvedPage) {
                  expect(resolvedPage.isResolved).to.be.true;
                });
              });
            });
          });
        });
      });
    });

    describe("not resolving a fetched page", function() {
      beforeEach(function() {
        this.totalPages = 5;
        this.recordsPerPage = 10;
        this.pages = [];
        this.resolvers = [];

        for(var i = 0; i < this.totalPages; i+=1){
          var records = this.server.createList('record', this.recordsPerPage);
          this.pages.push( this.server.create('page', {records: records}) );
        }

        this.options = {
          pageSize: this.recordsPerPage,
          loadHorizon: 1,
          unloadHorizon: 1,
          fetch: () => {
            return new Ember.RSVP.Promise((resolve) => {
              this.resolvers.push(resolve);
            });
          }
        };
        this.dataset = new Dataset(this.options);
      });

      xit("captures the resolve", function() {
        var resolve = this.resolvers[0];
        expect(resolve.name).to.equal('resolvePromise');
      });

      xit("leaves the first page in a pending state", function() {
        var page = this.dataset.state.pages[0];
        expect(page.isPending).to.be.true;
      });

      describe("advancing the readOffset past the pending pages unloadHorizon", function() {
        beforeEach(function() {
          this.dataset.setReadOffset(2);
        });

        it("unloads the pending page", function () {
          var page = this.dataset.state.pages[0];
          expect(page.isRequested).to.be.false;
          expect(page.isPending).to.be.false;
        });

        describe("resolving all pages", function() {
          beforeEach(function() {
            var data = {
              records: this.server.createList('record', this.recordsPerPage)
            };
            this.resolvers.forEach(function(resolve) {
              resolve(data);
            });
          });

          describe("the pages which did change state since last fetch request", function() {
            beforeEach(function() {
              this.changedStatePage = this.dataset.state.pages.slice(0,1);
            });

            it("are not resolved", function () {
              this.changedStatePage.forEach(function (page) {
                expect(page.isResolved).to.be.false;
              });
            });
            it("remain unrequested", function () {
              this.changedStatePage.forEach(function (page) {
                expect(page.isRequested).to.be.false;
              });
            });
          });

          describe("the pages which did not change state since last fetch request", function() {
            beforeEach(function() {
              this.sameStatePages = this.dataset.state.pages.slice(1,3);
            });

            it("are resolved pages", function () {
              this.sameStatePages.forEach(function (page) {
                expect(page.isResolved).to.be.true;
              });
            });
          });
        });
      });
    });

    describe("setting totalPages in statistics", function() {
      beforeEach(function() {
        this.totalPages = 5;
        this.recordsPerPage = 10;
        this.pages = [];
        this.resolvers = [];
        this.rejecters = [];

        for(var i = 0; i < this.totalPages; i+=1){
          var records = this.server.createList('record', this.recordsPerPage);
          this.pages.push( this.server.create('page', {records: records}) );
        }

        this.options = {
          pageSize: this.recordsPerPage,
          initialReadOffset: 1,
          loadHorizon: 2,
          fetch: (pageOffset, stats) => {
            return new Ember.RSVP.Promise((resolve, reject) => {
              this.resolvers.push({
                resolve: resolve,
                pageOffset: pageOffset,
                stats: stats
              });
              this.rejecters.push({
                reject: reject,
                pageOffset: pageOffset,
                stats: stats
              });
            });
          }
        };
        this.dataset = new Dataset(this.options);
      });

      describe("resolving the first page with 10 pages", function() {
        beforeEach(function() {
          var records = this.server.createList('record', this.recordsPerPage);
          var obj = this.resolvers.shift();
          obj.stats.totalPages = 10;
          obj.resolve(records);
        });

        it("initializes the dataset to the specified number of pages", function() {
          expect(this.dataset.state.pages.length).to.equal(10);
        });

        describe("increasing the totalPages to 15", function() {
          beforeEach(function() {
            var records = this.server.createList('record', this.recordsPerPage);
            var obj = this.resolvers.shift();
            obj.stats.totalPages = 15;
            obj.resolve(records);
          });

          it("increases the dataset to the specified number of pages", function() {
            expect(this.dataset.state.pages.length).to.equal(15);
          });

          describe("decreasing the totalPages", function() {
            beforeEach(function() {
              var records = this.server.createList('record', this.recordsPerPage);
              var obj = this.resolvers.shift();
              obj.stats.totalPages = 5;
              obj.resolve(records);
            });

            it("decreases the dataset to the specified number of pages", function() {
              expect(this.dataset.state.pages.length).to.equal(5);
            });
          });
        });
      });
    });

    xdescribe("with no fetch function", function() {
      it("emits an observation of the state");
      it("indicates that the dataset is not doing any loading");
    });

    xdescribe("with a fetch function and the default load horizon", function() {
      it("requests the first page");
      it("now has a requested page");
      it("indicates that the dataset is now loading");
      it("indicates that the first page is loading");
      describe("when the first page resolves", function() {
        it("integrates the statistics");
        it("reflects the total number of records");
        it("reflects the total number of pages");
        it("indicates that the dataset is no longer loading");
        it("indicates that the page is no longer loading");
        it("contains empty objects for the items that have not even been requested");
        it("contains unequested pages for the pages that have not been requested");
      });
    });

    afterEach(function() {
      delete this.dataset;
      delete this.model;
      delete this.fetches;
    });
  });
});

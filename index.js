var lightify = require('node-lightify'),
  _ = require('underscore'),
  Promise = require('promise');


var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  homebridge.registerPlatform("homebridge-lightify", "Lightify",
    LightifyPlatform);
}

class LightifyPlatform {

  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.host = config["host"];
    this.lightify = null;
    this.lastDiscovery = null;
    this.discoveryResult = [];
  }

  getDevices() {
    let self = this;
    return new Promise((resolve, reject) => {
      if (this.lastDiscovery + 1000 < new Date().getTime()) {
        self.getLightify().then((lightify) => {
          lightify.discovery().then((data) => {
            self.lastDiscovery = new Date().getTime();
            self.discoveryResult = data.result;
            resolve(self.discoveryResult);
          });
        });
      } else {
        resolve(self.discoveryResult);
      }
    });
  }


  getLightify() {
    return new Promise((resolve, reject) => {
      if (!this.lightify) {
        lightify.start(this.host).then((data) => {
          this.lightify = lightify;
          console.log("Created new lightify");
          resolve(this.lightify);
        });
      } else {
        console.log("Using existing lightify");
        resolve(this.lightify);
      }
    });
  }

  accessories(callback) {
    let self = this;
    self.getDevices().then((devices) => {
      let accessories = _.map(devices, (device) => {
        if (lightify.isPlug(device.type)) {
          return new LightifyPlug(device.name, UUIDGen.generate(
            device.name), device.mac, self.getLightify(), self);
        } 
        else {
          return new LightifyLamp(device.name, UUIDGen.generate(
            device.name), device.mac, self.getLightify(), self);
        }
      });
      callback(accessories);
    });
  }
}


class LightifyPlug {
  constructor(name, uuid, mac, lighitfy, platform) {
    this.name = name;
    this.uuid = uuid;
    this.lightify = lightify;
    this.mac = mac;
    this.platform = platform;
  }

  isOnline(callback) {
    let self = this;
    lightify.discovery().then((data) => {
      let device = _.findWhere(data.result, {
        "mac": self.mac
      });
      callback(null, device.online);
    });
  }

  setState(value, callback) {
    lightify.node_on_off(this.mac, value);
    callback();
  }

  getState(callback) {
    var self = this;
    self.platform.getDevices().then((data) => {
      let device = _.findWhere(data.result, {
        "mac": self.mac
      });
      callback(null, device.status === 1 || device.online === 1);
    });
  }

  getServices() {
    let self = this;
    var outletService = new Service.Outlet(this.name);

    outletService.getCharacteristic(Characteristic.On)
      .on('set', (a, b) => {
        self.setState(a, b);
      })
      .on('get', (a, b) => {
        self.getState(a, b);
      });

    outletService.getCharacteristic(Characteristic.OutletInUse)
      .on('get', (a, b) => {
        self.isOnline(a, b);
      });

    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, "OSRAM Licht AG")
      .setCharacteristic(Characteristic.Model, "Lightify Switch");
    return [service, outletService];
  }

}

class LightifyLamp extends LightifyPlug {

  constructor(name, uuid, mac, lighitfy, platform) {
    super(name, uuid, mac, lighitfy, platform)
  }

  setBrightness(value, callback) {
    lightify.node_brightness(this.mac, value);
    callback();
  }

  getBrightness(callback) {
    var self = this;
    self.platform.getDevices().then((data) => {
      let device = _.findWhere(data.result, {
        "mac": self.mac
      });
      callback(null, device.brightness);
    });
    callback(null, 100);
  }

  getServices() {
    let self = this;
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, "OSRAM Licht AG")
      .setCharacteristic(Characteristic.Model, "Lightify Lamp");

    var lightService = new Service.Lightbulb(this.name);
    lightService.addCharacteristic(Characteristic.OutletInUse);
    lightService.getCharacteristic(Characteristic.On)
      .on('set', (a, b) => {
        self.setState(a, b);
      })
      .on('get', (a, b) => {
        self.getState(a, b);
      });
    lightService.getCharacteristic(Characteristic.Brightness)
      .on('set', (a, b) => {
        self.setBrightness(a, b);
      })
      .on('get', (a, b) => {
        self.getBrightness(a, b);
      });
    lightService.getCharacteristic(Characteristic.OutletInUse)
      .on('get', (a, b) => {
        self.isOnline(a, b);
      });

    return [service, lightService];
  }
}

// All Tomorrow's Parties -- server

Meteor.publish("directory", function () {
  return Meteor.users.find({}, {fields: {emails: 1, profile: 1}});
});

Meteor.publish("emergencies", function () {
  return Emergencies.find(
    {$or: [{owner: this.userId}]});
});

// All Tomorrow's Parties -- client

Meteor.subscribe("directory");
Meteor.subscribe("emergencies");

// If no party selected, or if the selected party was deleted, select one.
Meteor.startup(function () {
  Deps.autorun(function () {
    var selected = Session.get("selected");
    if (! selected || ! Emergencies.findOne(selected)) {
      var emergency = Emergencies.findOne();
      if (emergency)
        Session.set("selected", emergency._id);
      else
        Session.set("selected", null);
    }
  });
});

///////////////////////////////////////////////////////////////////////////////
// Party details sidebar

Template.details.emergency = function () {
  return Emergencies.findOne(Session.get("selected"));
};

Template.details.anyEmergencies = function () {
  return Emergencies.find().count() > 0;
};

Template.details.creatorName = function () {
  var owner = Meteor.users.findOne(this.owner);
  if (owner._id === Meteor.userId())
    return "me";
  return displayName(owner);
};

Template.details.canRemove = function () {
  return this.owner === Meteor.userId() && attending(this) === 0;
};

Template.details.maybeChosen = function (what) {
  var myRsvp = _.find(this.rsvps, function (r) {
    return r.user === Meteor.userId();
  }) || {};

  return what == myRsvp.rsvp ? "chosen btn-inverse" : "";
};

Template.details.events({
  'click .rsvp_si': function () {
    Meteor.call("rsvp", Session.get("selected"), "si");
    return false;
  },
  'click .rsvp_no': function () {
    Meteor.call("rsvp", Session.get("selected"), "no");
    return false;
  },
  'click .remove': function () {
    Emergencies.remove(this._id);
    return false;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Party attendance widget

Template.attendance.rsvpName = function () {
  var user = Meteor.users.findOne(this.user);
  return displayName(user);
};

Template.attendance.invitationName = function () {
  return displayName(this);
};

Template.attendance.rsvpIs = function (what) {
  return this.rsvp === what;
};

Template.attendance.nobody = function () {
  return ! this.public && (this.rsvps.length);
};

Template.attendance.canInvite = function () {
  return ! this.public && this.owner === Meteor.userId();
};

///////////////////////////////////////////////////////////////////////////////
// Map display

// Use jquery to get the position clicked relative to the map element.
var coordsRelativeToElement = function (element, event) {
  var offset = $(element).offset();
  var x = event.pageX - offset.left;
  var y = event.pageY - offset.top;
  return { x: x, y: y };
};

Template.map.events({
  'mousedown circle, mousedown text': function (event, template) {
    Session.set("selected", event.currentTarget.id);
  },
  'dblclick .map': function (event, template) {
    if (! Meteor.userId()) // must be logged in to create events
      return;
    var coords = coordsRelativeToElement(event.currentTarget, event);
    openCreateDialog(coords.x / 500, coords.y / 500);
  }
});

Template.map.rendered = function () {
  var self = this;
  self.node = self.find("svg");

  if (! self.handle) {
    self.handle = Deps.autorun(function () {
      var selected = Session.get('selected');
      var selectedEmergency = selected && Emergencies.findOne(selected);
      var radius = function (emergency) {
        return 10 + Math.sqrt(attending(emergency)) * 10;
      };

      // Draw a circle for each emergency
      var updateCircles = function (group) {
        group.attr("id", function (emergency) { return emergency._id; })
        .attr("cx", function (emergency) { return emergency.x * 500; })
        .attr("cy", function (emergency) { return emergency.y * 500; })
        .attr("r", radius)
        .style('opacity', function (emergency) {
          return selected === emergency._id ? 1 : 0.6;
        });
      };

      var circles = d3.select(self.node).select(".circles").selectAll("circle")
        .data(Emergencies.find().fetch(), function (emergency) { return emergency._id; });

      updateCircles(circles.enter().append("circle"));
      updateCircles(circles.transition().duration(250).ease("cubic-out"));
      circles.exit().transition().duration(250).attr("r", 0).remove();

      // Label each with the current attendance count
      var updateLabels = function (group) {
        group.attr("id", function (emergency) { return emergency._id; })
        .text(function (emergency) {return attending(emergency) || '';})
        .attr("x", function (emergency) { return emergency.x * 500; })
        .attr("y", function (emergency) { return emergency.y * 500 + radius(emergency)/2 })
        .style('font-size', function (emergency) {
          return radius(emergency) * 1.25 + "px";
        });
      };

      var labels = d3.select(self.node).select(".labels").selectAll("text")
        .data(Emergencies.find().fetch(), function (emergency) { return emergency._id; });

      updateLabels(labels.enter().append("text"));
      updateLabels(labels.transition().duration(250).ease("cubic-out"));
      labels.exit().remove();

      // Draw a dashed circle around the currently selected party, if any
      var callout = d3.select(self.node).select("circle.callout")
        .transition().duration(250).ease("cubic-out");
      if (selectedEmergency)
        callout.attr("cx", selectedEmergency.x * 500)
        .attr("cy", selectedEmergency.y * 500)
        .attr("r", radius(selectedEmergency) + 10)
        .attr("class", "callout")
        .attr("display", '');
      else
        callout.attr("display", 'none');
    });
  }
};

Template.map.destroyed = function () {
  this.handle && this.handle.stop();
};

///////////////////////////////////////////////////////////////////////////////
// Create Emergency dialog

var openCreateDialog = function (x, y) {
  Session.set("createCoords", {x: x, y: y});
  Session.set("createError", null);
  Session.set("showCreateDialog", true);
};

Template.page.showCreateDialog = function () {
  return Session.get("showCreateDialog");
};

Template.createDialog.events({
  'click .save': function (event, template) {
    var title = template.find(".title").value;
    var description = template.find(".description").value;
    var coords = Session.get("createCoords");

    if (title.length && description.length) {
      var id = createEmergency({
        title: title,
        description: description,
        x: coords.x,
        y: coords.y
      });

      Session.set("selected", id);
      Session.set("showCreateDialog", false);
    } else {
      Session.set("createError",
                  "Necesita un título y una descripción");
    }
  },

  'click .cancel': function () {
    Session.set("showCreateDialog", false);
  }
});

Template.createDialog.error = function () {
  return Session.get("createError");
};

//---
/*
http://asynchrotron.com/blog/2013/12/27/realtime-maps-with-meteor-and-leaflet/
$(window).resize(function () {
  var h = $(window).height(), offsetTop = 90; // Calculate the top offset
  $mc = $('#map_canvas');
  $mc.css('height', (h - offsetTop));
}).resize();

map = L.map($('#map_canvas'), {
  doubleClickZoom: false,
  touchZoom: false
}).setView(new L.LatLng(41.8781136, -87.66677956445312), 13);

L.tileLayer('http://{s}.tile.stamen.com/toner/{z}/{x}/{y}.png', {opacity: .5}).addTo(map);

map.on("dblclick", function(e) {
  if (! Meteor.userId()) // must be logged in to create parties
    return;

  Session.set("createCoords", e.latlng);
  Session.set("showCreateDialog", true);
});
*/
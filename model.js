// data model de SONRIE: Sistema ONline de Respuesta Inmediata a Emergencias

///////////////////////////////////////////////////////////////////////////////
// Punto de Emergencia

/*
  Cada punto de emergencia se representa como un
  documento en la colección Emergencies:
    owner: user id
    x, y: Number (screen coordinates in the interval [0, 1])
    title, description: String
    rsvps: Array of centers related like {user: userId, rsvp: "yes"} (or "no"/"maybe")
*/
Emergencies = new Meteor.Collection("emergencies");

Emergencies.allow({
  insert: function (userId, emergency) {
    return false; // solo insercion a traves de createEmergency
  },
  update: function (userId, emergency, fields, modifier) {
    if (userId !== emergency.owner)
      return false; // solo puede actualizar el que crea la emergencia

    var allowed = ["title", "description", "x", "y"];
    if (_.difference(fields, allowed).length)
      return false; // solo se puede actualizar los campos en "allowed"

    // todo: implementar validacion
    return true;
  },
  remove: function (userId, emergency) {
    // solo se pueden matar emergencias que no tengan centros de acopio asociados
    return emergency.owner === userId && attending(emergency) === 0;
  }
});

attending = function (emergency) {
  return (_.groupBy(emergency.rsvps, 'rsvp').yes || []).length;
};

var NonEmptyString = Match.Where(function (x) {
  check(x, String);
  return x.length !== 0;
});

var Coordinate = Match.Where(function (x) {
  check(x, Number);
  return x >= 0 && x <= 1;
});

createEmergency = function (options) {
  var id = Random.id();
  Meteor.call('createEmergency', _.extend({ _id: id }, options));
  return id;
};

Meteor.methods({
  // options should include: title, description, x, y, public
  createEmergency: function (options) {
    check(options, {
      title: NonEmptyString,
      description: NonEmptyString,
      x: Coordinate,
      y: Coordinate,
      _id: Match.Optional(NonEmptyString)
    });

    if (options.title.length > 300)
      throw new Meteor.Error(413, "El título es muy largo");
    if (options.description.length > 1500)
      throw new Meteor.Error(413, "La descripción es muy larga");
    if (! this.userId)
      throw new Meteor.Error(403, "Debes ingresar primero");

    var id = options._id || Random.id();
    Emergencies.insert({
      _id: id,
      owner: this.userId,
      x: options.x,
      y: options.y,
      title: options.title,
      description: options.description,
      rsvps: []
    });
    return id;
  },

  rsvp: function (emergencyId, rsvp) {
    check(emergencyId, String);
    check(rsvp, String);
    if (! this.userId)
      throw new Meteor.Error(403, "Debes ingresar primero para confirmar ayuda");
    if (! _.contains(['si', 'no'], rsvp))
      throw new Meteor.Error(400, "Confirmación inválida");
    var emergency = Emergencies.findOne(emergencyId);
    if (! emergency)
      throw new Meteor.Error(404, "No existe tal emergencia");

    var rsvpIndex = _.indexOf(_.pluck(emergency.rsvps, 'user'), this.userId);
    if (rsvpIndex !== -1) {
      // update existing rsvp entry

      if (Meteor.isServer) {
        // update the appropriate rsvp entry with $
        Emergencies.update(
          {_id: emergencyId, "rsvps.user": this.userId},
          {$set: {"rsvps.$.rsvp": rsvp}});
      } else {
        // minimongo doesn't yet support $ in modifier. as a temporary
        // workaround, make a modifier that uses an index. this is
        // safe on the client since there's only one thread.
        var modifier = {$set: {}};
        modifier.$set["rsvps." + rsvpIndex + ".rsvp"] = rsvp;
        Emergencies.update(emergencyId, modifier);
      }

      // Possible improvement: send email to the other people that are
      // coming to the party.
    } else {
      // add new rsvp entry
      Emergencies.update(emergencyId,
                     {$push: {rsvps: {user: this.userId, rsvp: rsvp}}});
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// Users

displayName = function (user) {
  if (user.profile && user.profile.name)
    return user.profile.name;
  return user.emails[0].address;
};

var contactEmail = function (user) {
  if (user.emails && user.emails.length)
    return user.emails[0].address;
  if (user.services && user.services.facebook && user.services.facebook.email)
    return user.services.facebook.email;
  return null;
};
